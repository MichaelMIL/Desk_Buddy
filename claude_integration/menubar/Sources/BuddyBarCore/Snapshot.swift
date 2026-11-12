import Foundation

/// The bridge daemon's `GET /status` reply (`Controller.snapshot()` in buddy_bridge.py).
/// Every field is optional on the wire, so an older daemon still decodes.
public struct BridgeSnapshot: Decodable, Equatable {
    public var host: String
    public var active: Bool             // the bridge changed the buddy and has not put it back yet
    public var previous: String?        // what the buddy played before Claude started
    public var showing: String?         // the animation last played
    public var activity: String?        // the activity it was played for
    public var wanted: String?          // the activity the bridge wants to show now
    public var boardError: String       // "" while the buddy answers
    public var sessions: [Session]
    public var recent: [Play]
    public var link: String?            // "Bluetooth (any desk buddy)" or "http://…/"
    public var connected: Bool?         // Bluetooth link up; nil over Wi-Fi (no lasting link)
    public var holdSeconds: Int         // left of a `hold` (another program uses the buddy)
    public var pid: Int?
    public var python: String?          // the daemon's interpreter
    public var paused: Bool?            // manual mode, as the daemon sees it

    enum CodingKeys: String, CodingKey {
        case host, active, previous, showing, activity, wanted, sessions, recent, link, connected, pid, python, paused
        case boardError = "board_error", holdSeconds = "hold_s"
    }

    public init(host: String = "", active: Bool = false, previous: String? = nil, showing: String? = nil,
                activity: String? = nil, wanted: String? = nil, boardError: String = "",
                sessions: [Session] = [], recent: [Play] = [], link: String? = nil,
                connected: Bool? = nil, holdSeconds: Int = 0, pid: Int? = nil) {
        self.host = host; self.active = active; self.previous = previous; self.showing = showing
        self.activity = activity; self.wanted = wanted; self.boardError = boardError
        self.sessions = sessions; self.recent = recent; self.link = link
        self.connected = connected; self.holdSeconds = holdSeconds; self.pid = pid
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        host = try c.decodeIfPresent(String.self, forKey: .host) ?? ""
        active = try c.decodeIfPresent(Bool.self, forKey: .active) ?? false
        previous = try c.decodeIfPresent(String.self, forKey: .previous)
        showing = try c.decodeIfPresent(String.self, forKey: .showing)
        activity = try c.decodeIfPresent(String.self, forKey: .activity)
        wanted = try c.decodeIfPresent(String.self, forKey: .wanted)
        boardError = try c.decodeIfPresent(String.self, forKey: .boardError) ?? ""
        sessions = try c.decodeIfPresent([Session].self, forKey: .sessions) ?? []
        recent = try c.decodeIfPresent([Play].self, forKey: .recent) ?? []
        link = try c.decodeIfPresent(String.self, forKey: .link)
        connected = try c.decodeIfPresent(Bool.self, forKey: .connected)
        holdSeconds = try c.decodeIfPresent(Int.self, forKey: .holdSeconds) ?? 0
        pid = try c.decodeIfPresent(Int.self, forKey: .pid)
        python = try c.decodeIfPresent(String.self, forKey: .python)
        paused = try c.decodeIfPresent(Bool.self, forKey: .paused)
    }

    /// The link to show: what the daemon reports, else derived from the configured host.
    public var linkDescription: String { link ?? BridgeConfig.describe(host: host) }
}

/// One Claude Code session the bridge has heard from.
public struct Session: Decodable, Equatable, Identifiable {
    public var id: String
    public var cwd: String
    public var activity: String?        // nil = idle
    public var waitingForUser: Bool
    public var subagents: Int
    public var lastEventSeconds: Double

    enum CodingKeys: String, CodingKey {
        case id, cwd, activity, subagents
        case waitingForUser = "waiting_for_user", lastEventSeconds = "last_event_s"
    }

    public init(id: String, cwd: String = "", activity: String? = nil, waitingForUser: Bool = false,
                subagents: Int = 0, lastEventSeconds: Double = 0) {
        self.id = id; self.cwd = cwd; self.activity = activity
        self.waitingForUser = waitingForUser; self.subagents = subagents; self.lastEventSeconds = lastEventSeconds
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(String.self, forKey: .id) ?? "?"
        cwd = try c.decodeIfPresent(String.self, forKey: .cwd) ?? ""
        activity = try c.decodeIfPresent(String.self, forKey: .activity)
        waitingForUser = try c.decodeIfPresent(Bool.self, forKey: .waitingForUser) ?? false
        subagents = try c.decodeIfPresent(Int.self, forKey: .subagents) ?? 0
        lastEventSeconds = try c.decodeIfPresent(Double.self, forKey: .lastEventSeconds) ?? 0
    }

    /// The project folder's name ("desk_buddies"), or the session id without a folder.
    public var project: String {
        let name = (cwd as NSString).lastPathComponent
        return name.isEmpty || name == "/" ? id : name
    }
}

/// One entry of the daemon's recent history: ["14:02:11", "reading", "claude__reading"].
public struct Play: Decodable, Equatable {
    public var time: String
    public var activity: String
    public var name: String

    public init(time: String, activity: String, name: String) {
        self.time = time; self.activity = activity; self.name = name
    }

    public init(from decoder: Decoder) throws {
        var c = try decoder.unkeyedContainer()
        time = try c.decode(String.self)
        activity = try c.decode(String.self)
        name = try c.decode(String.self)
    }
}

/// "just now", "12 s ago", "3 min ago", "2 h ago".
public func ago(_ seconds: Double) -> String {
    if seconds < 2 { return "just now" }
    if seconds < 60 { return "\(Int(seconds)) s ago" }
    if seconds < 3600 { return "\(Int(seconds / 60)) min ago" }
    return "\(Int(seconds / 3600)) h ago"
}
