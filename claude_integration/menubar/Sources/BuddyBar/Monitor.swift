import AppKit
import BuddyBarCore
import ServiceManagement

/// Polls the bridge daemon (GET /status on 127.0.0.1) and its files, controls the buddy through the
/// daemon (GET / POST /buddy: its link; the buddy takes two Bluetooth connections), and runs the actions.
@MainActor
final class Monitor: ObservableObject {
    @Published private(set) var snapshot: BridgeSnapshot?
    @Published private(set) var config = BridgeConfig()
    @Published private(set) var hooks = HookInfo()
    @Published private(set) var message: String?        // what the last action did
    @Published private(set) var working = false

    // the buddy (only while the panel is open: reading it holds the Bluetooth link)
    @Published private(set) var buddy: BuddyState?
    @Published private(set) var buddyCommands: [String] = []
    @Published private(set) var buddyBusy = false        // connecting, or a command in flight
    @Published private(set) var buddyError: String?
    @Published private(set) var daemonTooOld = false     // a daemon from before /buddy

    let paths = BridgePaths()
    private var poll: Task<Void, Never>?
    private var messageClear: Task<Void, Never>?
    private var panelOpen = false
    private var buddyFetchedAt = Date.distantPast
    private var buddyLoading = false
    private let http: URLSession = {
        let c = URLSessionConfiguration.ephemeral
        c.connectionProxyDictionary = [:]
        c.requestCachePolicy = .reloadIgnoringLocalCacheData
        return URLSession(configuration: c)
    }()

    var state: BridgeState {
        var c = config
        c.enabled = !manual                        // a mode switch in flight shows at once
        return .derive(hooks: hooks, config: c, snapshot: snapshot)
    }
    var daemonUp: Bool { snapshot != nil }

    init() {
        poll = Task { [weak self] in
            while !Task.isCancelled {
                await self?.refresh()
                await self?.refreshBuddyIfDue()
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
        if snap == nil, buddy != nil { buddy = nil }      // the daemon went away: controls need it again
    }

    // MARK: the panel

    func panelOpened() {
        guard !panelOpen else { return }
        panelOpen = true
        if daemonUp {
            Task { await loadBuddy() }
        } else if manual && hooks.installed {
            connectBuddy()                         // manual: the controls are the point; start the daemon
        }
    }

    func panelClosed() { panelOpen = false }

    private func refreshBuddyIfDue() async {
        guard panelOpen, daemonUp, buddy != nil, !buddyBusy,
              Date().timeIntervalSince(buddyFetchedAt) > 4 else { return }
        await loadBuddy(quiet: true)
    }

    // MARK: the buddy

    /// Starts the daemon if needed (it starts by itself with the next Claude Code event), then reads the buddy.
    func connectBuddy() {
        Task {
            buddyBusy = true
            buddyError = nil
            if !daemonUp {
                let (ok, out) = await runBridge("start")
                await refresh()
                if !ok || !daemonUp {
                    buddyBusy = false
                    buddyError = ok ? "The bridge did not start" : out
                    return
                }
            }
            buddyBusy = false
            await loadBuddy()
        }
    }

    /// Stops an old daemon and starts the current one (after updating buddy_bridge.py).
    func restartDaemon() {
        Task {
            buddyBusy = true
            _ = await request("POST", "/stop", body: Data("{}".utf8), timeout: 3)
            for _ in 0..<20 where daemonUp {
                try? await Task.sleep(nanoseconds: 250_000_000)
                await refresh()
            }
            daemonTooOld = false
            buddyBusy = false
            connectBuddy()
        }
    }

    func loadBuddy(quiet: Bool = false) async {
        guard !buddyLoading else { return }
        buddyLoading = true
        if !quiet { buddyBusy = true }
        let r = await request("GET", "/buddy", timeout: 90)     // Bluetooth: scan + connect (+ pairing)
        buddyLoading = false
        if !quiet { buddyBusy = false }
        buddyFetchedAt = Date()
        if pending == nil { apply(r, quiet: quiet) }           // else the state is about to change anyway
        flushPending()
    }

    /// One console command: play <name>, cycle, next, brightness <n>, screen on|off, theme <t>|none.
    /// While another is in flight, the latest one waits and goes next (a slider sends many).
    func send(_ command: String) {
        if command.hasPrefix("play "), command != "play cycle" { lastFace = String(command.dropFirst(5)) }
        optimistic(command)
        if buddyBusy || buddyLoading {
            pending = command
            return
        }
        Task {
            buddyBusy = true
            let body = try? JSONSerialization.data(withJSONObject: ["command": command])
            let r = await request("POST", "/buddy", body: body, timeout: 90)
            buddyBusy = false
            buddyFetchedAt = Date()
            apply(r, quiet: false)
            flushPending()
        }
    }

    private var pending: String?
    private var lastFace: String?                          // what Manual goes back to after cycling

    private func flushPending() {
        if let p = pending, !buddyBusy, !buddyLoading {
            pending = nil
            send(p)
        }
    }

    private func optimistic(_ command: String) {
        guard var b = buddy else { return }
        let parts = command.split(separator: " ", maxSplits: 1).map(String.init)
        let arg = parts.count > 1 ? parts[1] : ""
        switch parts.first {
        case "brightness": b.brightness = Int(arg) ?? b.brightness
        case "screen": b.screen = arg == "on"
        case "theme": b.theme = arg == "none" ? "" : arg
        case "play": b.current = arg
        case "cycle": b.current = "cycle"
        default: return
        }
        buddy = b
    }

    private func apply(_ r: (Int, Data)?, quiet: Bool) {
        guard let (code, data) = r else {
            if !quiet { buddyError = "The bridge is not running" }
            return
        }
        if code == 404 {                                   // GET /buddy unknown: an older daemon
            daemonTooOld = true
            buddy = nil
            return
        }
        guard let reply = try? JSONDecoder().decode(BuddyReply.self, from: data) else {
            buddyError = "Unexpected reply from the bridge (\(code))"
            return
        }
        if let b = reply.buddy { buddy = b }
        if !reply.commands.isEmpty { buddyCommands = reply.commands }
        buddyError = reply.ok ? nil : (reply.error ?? "Failed (\(code))")   // 409 hold, 502 no answer, the buddy's own refusal
    }

    // MARK: bridge actions

    /// Manual (true): Claude Code stops changing the animation and the buddy goes back to what it
    /// played before Claude; the controls pick it. Follow (false): Claude Code's activity shows again.
    /// The switch shows the new mode at once; the file says otherwise only if the command fails.
    @Published private(set) var manualPending: Bool?

    var manual: Bool { manualPending ?? !config.enabled }

    func setManual(_ manual: Bool, then: ((Bool) -> Void)? = nil) {
        guard manual != self.manual else { then?(true); return }
        manualPending = manual
        working = true
        Task {
            let (ok, out) = await runBridge(manual ? "pause" : "resume")
            await refresh()
            working = false
            manualPending = nil
            say(ok ? out : "Failed: \(out)")
            if ok, manual, panelOpen, buddy == nil { connectBuddy() }   // the controls are the point
            then?(ok)
        }
    }

    /// Follow Claude, Manual (one face stays) or Cycle (the buddy goes through its faces, plus the
    /// selected theme's). Manual and Cycle both pause the bridge and differ only in what the buddy
    /// plays, so the switch shows the buddy's own state; a choice in flight shows at once.
    @Published private(set) var modePending: BuddyMode?

    var mode: BuddyMode { modePending ?? BuddyMode.of(paused: manual, buddy: buddy) }

    func setMode(_ m: BuddyMode) {
        guard m != mode else { return }
        if m == .follow { setManual(false); return }
        modePending = m
        let wasFollowing = !manual
        setManual(true) { [weak self] ok in
            guard let self else { return }
            guard ok else { self.modePending = nil; return }
            Task {
                // just paused: the daemon first puts back what played before Claude (next tick);
                // after that it leaves a face picked here alone
                if wasFollowing { try? await Task.sleep(nanoseconds: 1_500_000_000) }
                self.modePending = nil
                if m == .cycle {
                    self.send("cycle")
                } else if self.buddy?.isCycling ?? true,
                          let face = self.buddy?.manualFace(last: self.lastFace) ?? self.lastFace {
                    self.send("play \(face)")
                }
            }
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

    /// `buddy_bridge.py <subcommand>`, with the daemon's own Python when known (it has bleak).
    private func runBridge(_ subcommand: String) async -> (Bool, String) {
        let recorded = snapshot?.python
            ?? (try? String(contentsOf: paths.pythonFile, encoding: .utf8))?.trimmingCharacters(in: .whitespacesAndNewlines)
        let python = recorded.flatMap { FileManager.default.isExecutableFile(atPath: $0) ? $0 : nil }
        guard let (exe, args) = hooks.invocation(subcommand, python: python) else {
            return (false, "The hooks are not installed: run buddy_bridge.py install")
        }
        return await Self.run(exe, args)
    }

    nonisolated static func run(_ executable: String, _ arguments: [String]) async -> (Bool, String) {
        await withCheckedContinuation { cont in
            DispatchQueue.global().async {
                let p = Process()
                p.executableURL = URL(fileURLWithPath: executable)
                p.arguments = arguments
                let pipe = Pipe()
                p.standardOutput = pipe
                p.standardError = pipe
                p.standardInput = FileHandle.nullDevice
                do { try p.run() } catch {
                    cont.resume(returning: (false, error.localizedDescription))
                    return
                }
                // `start` leaves the daemon running with our pipe closed (it detaches its own stdio)
                let out = pipe.fileHandleForReading.readDataToEndOfFile()
                p.waitUntilExit()
                cont.resume(returning: (p.terminationStatus == 0,
                                        String(decoding: out, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)))
            }
        }
    }
}
