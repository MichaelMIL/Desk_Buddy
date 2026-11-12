import Foundation

/// The buddy itself, as the daemon's `GET /buddy` / `POST /buddy` returns it: the `state` console
/// reply plus `names` over Bluetooth, or `GET /api/status` over Wi-Fi.
public struct BuddyState: Decodable, Equatable {
    public var current: String          // an animation name, or "cycle"
    public var screen: Bool
    public var brightness: Int          // 10...100
    public var theme: String            // "" = none
    public var animations: [String]

    enum CodingKeys: String, CodingKey { case current, screen, brightness, theme, animations }
    private struct Named: Decodable { var name: String }

    public init(current: String = "cycle", screen: Bool = true, brightness: Int = 100, theme: String = "",
                animations: [String] = []) {
        self.current = current; self.screen = screen; self.brightness = brightness
        self.theme = theme; self.animations = animations
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        current = try c.decodeIfPresent(String.self, forKey: .current) ?? "cycle"
        screen = try c.decodeIfPresent(Bool.self, forKey: .screen) ?? true
        brightness = try c.decodeIfPresent(Int.self, forKey: .brightness) ?? 100
        theme = try c.decodeIfPresent(String.self, forKey: .theme) ?? ""
        // names (Bluetooth, /api/status) or {"name": ...} objects (/api/anim)
        if let names = try? c.decodeIfPresent([String].self, forKey: .animations) {
            animations = names
        } else {
            animations = (try? c.decodeIfPresent([Named].self, forKey: .animations))?.map(\.name) ?? []
        }
    }

    public var isCycling: Bool { current == "cycle" }

    /// Themes are the `<theme>__` prefixes of the animation names (`xmas__santa` is in `xmas`).
    public var themes: [String] {
        Array(Set(animations.compactMap { BuddyState.theme(of: $0) })).sorted()
    }

    /// Faces of no theme (`face_happy`, `spinner`); they cycle whatever the theme.
    public var commonFaces: [String] { animations.filter { BuddyState.theme(of: $0) == nil }.sorted() }

    public func faces(in theme: String) -> [String] {
        animations.filter { BuddyState.theme(of: $0) == theme }.sorted()
    }

    public static func theme(of name: String) -> String? {
        guard let r = name.range(of: "__"), r.lowerBound != name.startIndex else { return nil }
        return String(name[..<r.lowerBound])
    }

    /// For menus: "bear__honey" -> "Honey", "face_happy" -> "Face happy".
    public static func displayName(_ name: String) -> String {
        if name == "cycle" { return "Cycling" }
        var s = name
        if let r = s.range(of: "__") { s = String(s[r.upperBound...]) }
        s = s.replacingOccurrences(of: "_", with: " ")
        return s.prefix(1).uppercased() + s.dropFirst()
    }
}

/// The daemon's reply to GET / POST /buddy.
public struct BuddyReply: Decodable, Equatable {
    public var ok: Bool
    public var reply: String?           // the buddy's answer to the command ("brightness 60%")
    public var error: String?
    public var buddy: BuddyState?
    public var commands: [String]       // what this link can do (Wi-Fi has no `next`)

    enum CodingKeys: String, CodingKey { case ok, reply, error, buddy, commands }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        ok = try c.decodeIfPresent(Bool.self, forKey: .ok) ?? false
        reply = try c.decodeIfPresent(String.self, forKey: .reply)
        error = try c.decodeIfPresent(String.self, forKey: .error)
        buddy = try c.decodeIfPresent(BuddyState.self, forKey: .buddy)
        commands = try c.decodeIfPresent([String].self, forKey: .commands) ?? []
    }
}
