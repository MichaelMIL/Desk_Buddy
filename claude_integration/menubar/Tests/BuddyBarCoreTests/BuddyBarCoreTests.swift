import AppKit
@testable import BuddyBarCore
import XCTest

final class BuddyBarCoreTests: XCTestCase {
    // A /status reply as buddy_bridge.py's Controller.snapshot() sends it.
    let statusJSON = """
    {"host": "ble", "active": true, "previous": "cycle", "showing": "claude__reading", "activity": "reading",
     "wanted": "reading", "board_error": "",
     "sessions": [{"id": "1ea8835d", "cwd": "/Users/x/desk_buddies", "activity": "reading",
                   "waiting_for_user": false, "subagents": 0, "last_event_s": 1.2},
                  {"id": "33800c45", "cwd": "", "activity": null, "waiting_for_user": false,
                   "subagents": 2, "last_event_s": 75.0}],
     "recent": [["14:02:09", "thinking", "claude__pondering"], ["14:02:11", "reading", "claude__reading"]],
     "link": "Bluetooth (any desk buddy)", "connected": true, "hold_s": 0, "pid": 80303}
    """

    func snapshot(_ json: String? = nil) throws -> BridgeSnapshot {
        try JSONDecoder().decode(BridgeSnapshot.self, from: Data((json ?? statusJSON).utf8))
    }

    let hooks = HookInfo(events: 15, command: #"python3 "/r/claude_integration/buddy_bridge.py" hook"#)

    func testDecodesStatus() throws {
        let s = try snapshot()
        XCTAssertEqual(s.showing, "claude__reading")
        XCTAssertEqual(s.connected, true)
        XCTAssertEqual(s.pid, 80303)
        XCTAssertEqual(s.sessions.map(\.project), ["desk_buddies", "33800c45"])
        XCTAssertNil(s.sessions[1].activity)
        XCTAssertEqual(s.recent.last, Play(time: "14:02:11", activity: "reading", name: "claude__reading"))
    }

    func testDecodesAnOlderDaemon() throws {
        // before link / connected / hold_s / pid were added
        let s = try snapshot(#"{"host": "192.168.50.99", "active": false, "showing": null, "activity": null,"#
                             + #" "wanted": null, "board_error": "", "sessions": [], "recent": []}"#)
        XCTAssertNil(s.connected)
        XCTAssertEqual(s.holdSeconds, 0)
        XCTAssertEqual(s.linkDescription, "http://192.168.50.99/")
    }

    func testStates() throws {
        var s = try snapshot()
        let on = BridgeConfig(host: "ble")
        XCTAssertEqual(BridgeState.derive(hooks: HookInfo(), config: on, snapshot: s), .hooksMissing)
        XCTAssertEqual(BridgeState.derive(hooks: hooks, config: BridgeConfig(enabled: false), snapshot: nil), .paused)
        XCTAssertEqual(BridgeState.derive(hooks: hooks, config: on, snapshot: nil), .notRunning)
        XCTAssertEqual(BridgeState.derive(hooks: hooks, config: on, snapshot: s),
                       .showing(activity: "reading", animation: "claude__reading"))

        s.sessions[1].waitingForUser = true
        XCTAssertEqual(BridgeState.derive(hooks: hooks, config: on, snapshot: s), .needsYou(project: "33800c45"))
        s.boardError = "play"
        XCTAssertEqual(BridgeState.derive(hooks: hooks, config: on, snapshot: s), .buddyDown(error: "play"))
        s.holdSeconds = 90
        XCTAssertEqual(BridgeState.derive(hooks: hooks, config: on, snapshot: s), .holding(seconds: 90))

        let idle = BridgeSnapshot(host: "ble", boardError: "status")   // an old error while idle: not a problem
        XCTAssertEqual(BridgeState.derive(hooks: hooks, config: on, snapshot: idle), .idle)
        XCTAssertEqual(BridgeState.derive(hooks: hooks, config: on, snapshot: BridgeSnapshot(wanted: "thinking")),
                       .starting(activity: "thinking"))
        XCTAssertTrue(BridgeState.idle.isRunning)
        XCTAssertFalse(BridgeState.notRunning.isRunning)
    }

    func testConfigAndHooks() {
        let c = BridgeConfig.parse(Data(#"{"host": "ble:Desk Buddy", "port": 47616, "enabled": false}"#.utf8))
        XCTAssertEqual(c, BridgeConfig(host: "ble:Desk Buddy", port: 47616, enabled: false))
        XCTAssertEqual(BridgeConfig.parse(nil), BridgeConfig())
        XCTAssertEqual(BridgeConfig.parse(Data("not json".utf8)), BridgeConfig())
        XCTAssertEqual(BridgeConfig.describe(host: "ble:Desk Buddy"), "Bluetooth (Desk Buddy)")
        XCTAssertEqual(BridgeConfig.describe(host: "ble"), "Bluetooth (any desk buddy)")

        let settings = """
        {"hooks": {
          "PreToolUse": [{"matcher": "", "hooks": [{"type": "command", "command": "other.sh"}]},
                         {"hooks": [{"type": "command", "command": "python3 \\"/r/buddy_bridge.py\\" hook"}]}],
          "Stop": [{"hooks": [{"type": "command", "command": "python3 \\"/r/buddy_bridge.py\\" hook"}]}],
          "Notification": [{"hooks": [{"type": "command", "command": "say hi"}]}]},
         "model": "opus"}
        """
        let h = HookInfo.parse(settings: Data(settings.utf8))
        XCTAssertEqual(h.events, 2)
        XCTAssertTrue(h.installed)
        XCTAssertEqual(h.command("pause"), #"python3 "/r/buddy_bridge.py" pause"#)
        XCTAssertFalse(HookInfo.parse(settings: Data(#"{"model": "opus"}"#.utf8)).installed)
        XCTAssertNil(HookInfo(events: 1, command: "something else").command("pause"))
    }

    func testPaths() {
        let p = BridgePaths(home: URL(fileURLWithPath: "/Users/x"), environment: [:])
        XCTAssertEqual(p.configFile.path, "/Users/x/.config/desk-buddy/claude.json")
        XCTAssertEqual(p.settingsFile.path, "/Users/x/.claude/settings.json")
        let q = BridgePaths(home: URL(fileURLWithPath: "/Users/x"), environment: ["DESK_BUDDY_HOME": "/tmp/db"])
        XCTAssertEqual(q.logFile.path, "/tmp/db/claude-bridge.log")
    }

    func testEverySymbolExists() {
        // Image(systemName:) shows nothing for a misspelt name: check them all against this macOS
        var symbols = Activity.table.values.map(\.symbol)
        let states: [BridgeState] = [.hooksMissing, .paused, .notRunning, .holding(seconds: 1), .buddyDown(error: "x"),
                                     .needsYou(project: "p"), .showing(activity: "nope", animation: nil), .idle]
        symbols += states.map(\.presentation.symbol)
        symbols += ["dot.radiowaves.left.and.right", "wifi", "hand.raised", "hand.raised.slash", "pause.circle",
                    "play.circle", "stop.circle", "doc.text.magnifyingglass", "power"]   // PanelView
        for s in Set(symbols) {
            XCTAssertNotNil(NSImage(systemSymbolName: s, accessibilityDescription: nil), s)
        }
    }

    func testActivityNames() {
        XCTAssertEqual(Activity.label("long_run"), "Long command")
        XCTAssertEqual(Activity.label("brand_new"), "Brand New")
        XCTAssertEqual(Activity.symbol("brand_new"), "sparkles")
        XCTAssertEqual(Activity.label(nil), "Idle")
        XCTAssertEqual(ago(0.5), "just now")
        XCTAssertEqual(ago(75), "1 min ago")
    }
}
