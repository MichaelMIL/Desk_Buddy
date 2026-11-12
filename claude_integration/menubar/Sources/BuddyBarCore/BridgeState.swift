import Foundation

/// What the menu bar icon says, most important first.
public enum BridgeState: Equatable {
    case hooksMissing                               // buddy_bridge.py install has not run
    case paused                                     // buddy_bridge.py pause
    case notRunning                                 // no daemon: it starts with the next Claude Code event
    case holding(seconds: Int)                      // another program uses the buddy (hold)
    case buddyDown(error: String)                   // the bridge has something to show, the buddy does not answer
    case needsYou(project: String)                  // a session waits for permission or an answer
    case showing(activity: String, animation: String?)
    case starting(activity: String)                 // wants to show it, not played yet
    case idle                                       // running, the buddy is left alone

    public static func derive(hooks: HookInfo, config: BridgeConfig, snapshot: BridgeSnapshot?) -> BridgeState {
        if !hooks.installed { return .hooksMissing }
        if !config.enabled { return .paused }
        guard let s = snapshot else { return .notRunning }
        if s.holdSeconds > 0 { return .holding(seconds: s.holdSeconds) }
        if !s.boardError.isEmpty && (s.wanted != nil || s.active) { return .buddyDown(error: s.boardError) }
        if let w = s.sessions.first(where: { $0.waitingForUser }) { return .needsYou(project: w.project) }
        if s.active, let act = s.activity { return .showing(activity: act, animation: s.showing) }
        if let w = s.wanted { return .starting(activity: w) }
        return .idle
    }

    public var isRunning: Bool {
        switch self {
        case .hooksMissing, .paused, .notRunning: return false
        default: return true
        }
    }

    public enum Tone: Equatable { case quiet, good, busy, attention, problem }

    /// SF Symbol, title and one line of detail for the panel's header (and the symbol for the menu bar).
    public var presentation: (symbol: String, title: String, detail: String, tone: Tone) {
        switch self {
        case .hooksMissing:
            return ("exclamationmark.triangle", "Hooks not installed", "Run buddy_bridge.py install", .problem)
        case .paused:
            return ("pause.circle", "Paused", "Claude Code is not shown on the buddy", .quiet)
        case .notRunning:
            return ("moon.zzz", "Not running", "Starts with the next Claude Code event", .quiet)
        case .holding(let s):
            return ("hand.raised", "Holding off", "Leaves the buddy alone for \(s) s", .quiet)
        case .buddyDown(let e):
            return ("exclamationmark.triangle", "Buddy not answering", "No reply to \(e); retrying", .problem)
        case .needsYou(let project):
            return (Activity.symbol("attention"), "Needs you", "\(project) is waiting for you", .attention)
        case .showing(let act, let anim):
            return (Activity.symbol(act), Activity.label(act), anim ?? "", .busy)
        case .starting(let act):
            return (Activity.symbol(act), Activity.label(act), "about to show", .busy)
        case .idle:
            return ("face.smiling", "Idle", "The buddy plays its own faces", .good)
        }
    }
}

/// The bridge's activities (ACTIVITIES and LANGS in buddy_bridge.py) as labels and SF Symbols.
public enum Activity {
    static let code = "chevron.left.forwardslash.chevron.right"
    public static let table: [String: (label: String, symbol: String)] = [
        "hello": ("Hello", "hand.wave"),
        "thinking": ("Thinking", "brain"),
        "planning": ("Planning", "list.bullet.clipboard"),
        "reading": ("Reading", "book"),
        "searching": ("Searching", "magnifyingglass"),
        "editing": ("Editing", "pencil"),
        "coding": ("Coding", code),
        "writing": ("Writing", "doc.text"),
        "running": ("Running a command", "terminal"),
        "testing": ("Testing", "testtube.2"),
        "passed": ("Tests passed", "checkmark.seal"),
        "failed": ("Failed", "xmark.octagon"),
        "debugging": ("Debugging", "ladybug"),
        "git": ("Git", "arrow.triangle.branch"),
        "conflict": ("Merge conflict", "arrow.triangle.merge"),
        "shipping": ("Shipping", "shippingbox"),
        "reviewing": ("Reviewing", "eye"),
        "ci": ("CI", "gearshape.2"),
        "todo": ("To-do list", "checklist"),
        "subagents": ("Subagents", "person.3"),
        "compacting": ("Compacting", "arrow.down.right.and.arrow.up.left"),
        "long_run": ("Long command", "infinity"),
        "attention": ("Needs you", "exclamationmark.bubble"),
        "done": ("Done", "checkmark.circle"),
        "idle": ("Idle", "face.smiling"),
        "python": ("Python", code), "c": ("C", code), "cpp": ("C++", code), "go": ("Go", code),
        "rust": ("Rust", code), "javascript": ("JavaScript", code), "typescript": ("TypeScript", code),
        "java": ("Java", code), "sql": ("SQL", code), "bash": ("Shell script", code),
        "polyglot": ("Coding", code),
    ]

    public static func label(_ act: String?) -> String {
        guard let act else { return "Idle" }
        return table[act]?.label ?? act.replacingOccurrences(of: "_", with: " ").capitalized
    }

    public static func symbol(_ act: String?) -> String {
        guard let act else { return "face.smiling" }
        return table[act]?.symbol ?? "sparkles"
    }
}
