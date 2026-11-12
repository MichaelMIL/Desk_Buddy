import Foundation

/// Where the bridge keeps its files (CONF_DIR etc. in buddy_bridge.py).
public struct BridgePaths {
    public var configFile: URL          // claude.json: host, port, enabled, ...
    public var logFile: URL             // claude-bridge.log
    public var settingsFile: URL        // ~/.claude/settings.json, where the hooks are

    public init(home: URL = FileManager.default.homeDirectoryForCurrentUser,
                environment: [String: String] = ProcessInfo.processInfo.environment) {
        let dir = environment["DESK_BUDDY_HOME"].map { URL(fileURLWithPath: $0) }
            ?? home.appendingPathComponent(".config/desk-buddy")
        configFile = dir.appendingPathComponent("claude.json")
        logFile = dir.appendingPathComponent("claude-bridge.log")
        settingsFile = home.appendingPathComponent(".claude/settings.json")
    }
}

/// The parts of claude.json the app needs (DEFAULTS in buddy_bridge.py).
public struct BridgeConfig: Equatable {
    public var host = "desk-buddy.local"
    public var port = 47615
    public var enabled = true

    public init(host: String = "desk-buddy.local", port: Int = 47615, enabled: Bool = true) {
        self.host = host; self.port = port; self.enabled = enabled
    }

    /// claude.json's contents; a missing or broken file means the defaults (as the bridge reads it).
    public static func parse(_ data: Data?) -> BridgeConfig {
        var c = BridgeConfig()
        guard let data, let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return c }
        if let h = obj["host"] as? String, !h.isEmpty { c.host = h }
        if let p = obj["port"] as? Int { c.port = p }
        if let e = obj["enabled"] as? Bool { c.enabled = e }
        return c
    }

    /// As make_board_desc() in buddy_bridge.py: "Bluetooth (any desk buddy)" or "http://host/".
    public static func describe(host: String) -> String {
        if host == "ble" || host.hasPrefix("ble:") {
            let name = String(host.dropFirst(4))
            return "Bluetooth (\(name.isEmpty ? "any desk buddy" : name))"
        }
        return "http://\(host)/"
    }
}

/// The bridge's hooks in ~/.claude/settings.json (`buddy_bridge.py install` writes them).
public struct HookInfo: Equatable {
    public var events = 0               // hook events that run buddy_bridge.py
    public var command: String?         // e.g. python3 "/…/buddy_bridge.py" hook

    public init(events: Int = 0, command: String? = nil) {
        self.events = events; self.command = command
    }

    public var installed: Bool { events > 0 }

    public static func parse(settings data: Data?) -> HookInfo {
        var info = HookInfo()
        guard let data, let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let hooks = obj["hooks"] as? [String: Any] else { return info }
        for (_, groups) in hooks {
            var mine = false
            for group in groups as? [[String: Any]] ?? [] {
                for hook in group["hooks"] as? [[String: Any]] ?? [] {
                    guard let cmd = hook["command"] as? String, cmd.contains("buddy_bridge.py") else { continue }
                    mine = true
                    if info.command == nil { info.command = cmd }
                }
            }
            if mine { info.events += 1 }
        }
        return info
    }

    /// The hook's own command line with another subcommand: `python3 "/…/buddy_bridge.py" pause`.
    /// Running exactly what Claude Code runs keeps the same Python and script.
    public func command(_ subcommand: String) -> String? {
        guard let cmd = command?.trimmingCharacters(in: .whitespaces), cmd.hasSuffix(" hook") else { return nil }
        return String(cmd.dropLast(" hook".count)) + " " + subcommand
    }
}
