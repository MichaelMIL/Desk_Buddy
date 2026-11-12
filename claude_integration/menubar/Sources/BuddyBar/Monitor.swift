import AppKit
import BuddyBarCore
import ServiceManagement

/// Polls the bridge daemon (GET /status on 127.0.0.1) and its files, and runs the actions.
@MainActor
final class Monitor: ObservableObject {
    @Published private(set) var snapshot: BridgeSnapshot?
    @Published private(set) var config = BridgeConfig()
    @Published private(set) var hooks = HookInfo()
    @Published private(set) var message: String?        // what the last action did
    @Published private(set) var working = false

    let paths = BridgePaths()
    private var poll: Task<Void, Never>?
    private var messageClear: Task<Void, Never>?
    private let http: URLSession = {
        let c = URLSessionConfiguration.ephemeral
        c.connectionProxyDictionary = [:]
        c.requestCachePolicy = .reloadIgnoringLocalCacheData
        return URLSession(configuration: c)
    }()

    var state: BridgeState { .derive(hooks: hooks, config: config, snapshot: snapshot) }

    init() {
        poll = Task { [weak self] in
            while !Task.isCancelled {
                await self?.refresh()
                try? await Task.sleep(nanoseconds: 1_500_000_000)
            }
        }
    }

    func refresh() async {
        let c = BridgeConfig.parse(try? Data(contentsOf: paths.configFile))
        let h = HookInfo.parse(settings: try? Data(contentsOf: paths.settingsFile))
        if c != config { config = c }
        if h != hooks { hooks = h }
        var snap: BridgeSnapshot?
        if let (code, data) = await request("GET", "/status"), code == 200 {
            snap = try? JSONDecoder().decode(BridgeSnapshot.self, from: data)
        }
        if snap != snapshot { snapshot = snap }
    }

    // MARK: actions

    func setPaused(_ paused: Bool) {
        guard let cmd = hooks.command(paused ? "pause" : "resume") else {
            return say("The hooks are not installed: run buddy_bridge.py install")
        }
        working = true
        Task {
            let (ok, out) = await Self.shell(cmd)
            working = false
            say(ok ? out : "Failed: \(out)")
            await refresh()
        }
    }

    func hold(_ seconds: Int) {
        Task {
            let body = try? JSONSerialization.data(withJSONObject: ["seconds": seconds])
            let r = await request("POST", "/hold", body: body, timeout: 15)
            say(r?.0 == 200 ? (seconds > 0 ? "The bridge leaves the buddy alone for \(seconds / 60) min" : "The bridge is back")
                            : "The bridge is not running")
            await refresh()
        }
    }

    func stopDaemon() {
        Task {
            let r = await request("POST", "/stop", body: Data("{}".utf8), timeout: 3)
            say(r?.0 == 200 ? "Stopping; the buddy goes back to what it was playing" : "The bridge is not running")
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            await refresh()
        }
    }

    func openLog() {
        if FileManager.default.fileExists(atPath: paths.logFile.path) {
            NSWorkspace.shared.open(paths.logFile)
        } else {
            say("No log yet (\(paths.logFile.path))")
        }
    }

    var openAtLogin: Bool { SMAppService.mainApp.status == .enabled }

    func setOpenAtLogin(_ on: Bool) {
        do {
            if on { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
        } catch {
            say("Open at login: \(error.localizedDescription)")
        }
        objectWillChange.send()
    }

    // MARK: plumbing

    private func say(_ text: String) {
        message = text.trimmingCharacters(in: .whitespacesAndNewlines)
        messageClear?.cancel()
        messageClear = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 8_000_000_000)
            if !Task.isCancelled { self?.message = nil }
        }
    }

    private func request(_ method: String, _ path: String, body: Data? = nil,
                         timeout: TimeInterval = 1) async -> (Int, Data)? {
        guard let url = URL(string: "http://127.0.0.1:\(config.port)\(path)") else { return nil }
        var r = URLRequest(url: url, timeoutInterval: timeout)
        r.httpMethod = method
        r.setValue("1", forHTTPHeaderField: "X-Desk-Buddy")   // the daemon refuses requests without it
        if let body {
            r.httpBody = body
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        guard let (data, resp) = try? await http.data(for: r), let h = resp as? HTTPURLResponse else { return nil }
        return (h.statusCode, data)
    }

    /// Runs a command line the way Claude Code runs the hook (a login shell, so python3 is found).
    nonisolated static func shell(_ command: String) async -> (Bool, String) {
        await withCheckedContinuation { cont in
            DispatchQueue.global().async {
                let p = Process()
                p.executableURL = URL(fileURLWithPath: "/bin/zsh")
                p.arguments = ["-lc", command]
                let pipe = Pipe()
                p.standardOutput = pipe
                p.standardError = pipe
                do { try p.run() } catch {
                    cont.resume(returning: (false, error.localizedDescription))
                    return
                }
                let out = pipe.fileHandleForReading.readDataToEndOfFile()
                p.waitUntilExit()
                cont.resume(returning: (p.terminationStatus == 0, String(decoding: out, as: UTF8.self)))
            }
        }
    }
}
