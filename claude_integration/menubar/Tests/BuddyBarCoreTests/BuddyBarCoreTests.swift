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
        XCTAssertNil(s.paused)                      // not in this reply: an older daemon
        XCTAssertEqual(try snapshot(#"{"paused": true}"#).paused, true)
        XCTAssertEqual(BridgeState.paused.presentation.title, "Manual")
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
                    "play.circle", "stop.circle", "doc.text.magnifyingglass", "power",   // PanelView
                    "repeat", "play.fill", "forward.end.fill", "sun.min", "display", "moon",
                    "square.grid.2x2", "slider.horizontal.3", "rectangle.stack"]           // BuddyControls
        for s in Set(symbols) {
            XCTAssertNotNil(NSImage(systemSymbolName: s, accessibilityDescription: nil), s)
        }
    }

    func testBuddyReplyOverBluetooth() throws {
        // POST /buddy through a Bluetooth daemon: the `state` reply plus `names`
        let json = """
        {"ok": true, "reply": "brightness 60%", "commands": ["play", "cycle", "next", "brightness", "screen", "theme"],
         "buddy": {"current": "cycle", "cycling": true, "screen": true, "brightness": 60, "theme": "xmas", "count": 6,
                   "animations": ["face_happy", "spinner", "xmas__santa", "xmas__lights", "claude__reading", "__odd"]}}
        """
        let r = try JSONDecoder().decode(BuddyReply.self, from: Data(json.utf8))
        XCTAssertTrue(r.ok)
        XCTAssertTrue(r.commands.contains("next"))
        let b = try XCTUnwrap(r.buddy)
        XCTAssertTrue(b.isCycling)
        XCTAssertEqual(b.brightness, 60)
        XCTAssertEqual(b.themes, ["claude", "xmas"])
        XCTAssertEqual(b.commonFaces, ["__odd", "face_happy", "spinner"])
        XCTAssertEqual(b.faces(in: "xmas"), ["xmas__lights", "xmas__santa"])
    }

    func testBuddyReplyOverWifiAndErrors() throws {
        // GET /api/status carries much more; animations may also come as objects
        let wifi = #"{"ok": true, "commands": ["play"], "buddy": {"id": "3ce36c", "current": "bear__honey","#
            + #" "animations": [{"name": "bear__honey", "bytes": 1}], "screen": false, "brightness": 30, "theme": ""}}"#
        let b = try XCTUnwrap(JSONDecoder().decode(BuddyReply.self, from: Data(wifi.utf8)).buddy)
        XCTAssertEqual(b, BuddyState(current: "bear__honey", screen: false, brightness: 30, theme: "",
                                     animations: ["bear__honey"]))
        XCTAssertFalse(b.isCycling)
        let err = try JSONDecoder().decode(BuddyReply.self, from: Data(#"{"ok": false, "error": "holding off the buddy"}"#.utf8))
        XCTAssertFalse(err.ok)
        XCTAssertEqual(err.error, "holding off the buddy")
        XCTAssertNil(err.buddy)
        XCTAssertEqual(BuddyState.displayName("bear__honey"), "Honey")
        XCTAssertEqual(BuddyState.displayName("face_happy"), "Face happy")
        XCTAssertEqual(BuddyState.displayName("cycle"), "Cycling")
    }

    func testModes() {
        let cycling = BuddyState(current: "cycle", animations: ["face_happy", "spinner", "xmas__santa"])
        var still = cycling
        still.current = "xmas__santa"
        XCTAssertEqual(BuddyMode.of(paused: false, buddy: cycling), .follow)    // following Claude, whatever plays
        XCTAssertEqual(BuddyMode.of(paused: true, buddy: cycling), .cycle)
        XCTAssertEqual(BuddyMode.of(paused: true, buddy: still), .manual)
        XCTAssertEqual(BuddyMode.of(paused: true, buddy: nil), .manual)         // not read yet
        // Manual after cycling goes back to the last pick, if it is still stored
        XCTAssertEqual(cycling.manualFace(last: "xmas__santa"), "xmas__santa")
        XCTAssertEqual(cycling.manualFace(last: "gone__face"), "face_happy")
        XCTAssertEqual(cycling.manualFace(last: nil), "face_happy")
        XCTAssertEqual(BuddyState(animations: ["spinner", "bear__honey"]).manualFace(last: "cycle"), "spinner")
        XCTAssertNil(BuddyState(animations: []).manualFace(last: nil))
    }

    func testInvocation() {
        let h = HookInfo(events: 3, command: #"python3 "/r/claude integration/buddy_bridge.py" hook"#)
        XCTAssertEqual(h.script, "/r/claude integration/buddy_bridge.py")
        let direct = h.invocation("start", python: "/opt/conda/bin/python3")
        XCTAssertEqual(direct?.executable, "/opt/conda/bin/python3")
        XCTAssertEqual(direct?.arguments, ["/r/claude integration/buddy_bridge.py", "start"])
        let shell = h.invocation("pause", python: nil)
        XCTAssertEqual(shell?.executable, "/bin/zsh")
        XCTAssertEqual(shell?.arguments, ["-lc", #"python3 "/r/claude integration/buddy_bridge.py" pause"#])
        XCTAssertEqual(HookInfo(events: 1, command: "python3 /r/buddy_bridge.py hook").script, "/r/buddy_bridge.py")
        XCTAssertNil(HookInfo().invocation("start", python: "/usr/bin/python3"))
        XCTAssertEqual(BridgePaths(home: URL(fileURLWithPath: "/Users/x"), environment: [:]).pythonFile.path,
                       "/Users/x/.config/desk-buddy/claude-python")
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
