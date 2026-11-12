import Foundation

/// The buddy itself, as the daemon's `GET /buddy` / `POST /buddy` returns it: the `state` console
/// reply plus `names` over Bluetooth, or `GET /api/status` over Wi-Fi.
public struct BuddyState: Decodable, Equatable {
    public var current: String          // an animation name, or "cycle"
    public var screen: Bool
    public var brightness: Int          // 10...100
    public var theme: String            // "" = none
    public var animations: [String]
    public var library: [String]        // what the bridge's library could put back on the buddy

    enum CodingKeys: String, CodingKey { case current, screen, brightness, theme, animations, library }
    private struct Named: Decodable { var name: String }

    public init(current: String = "cycle", screen: Bool = true, brightness: Int = 100, theme: String = "",
                animations: [String] = [], library: [String] = []) {
        self.current = current; self.screen = screen; self.brightness = brightness
        self.theme = theme; self.animations = animations; self.library = library
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
        library = (try? c.decodeIfPresent([String].self, forKey: .library)) ?? []
    }

    public var isCycling: Bool { current == "cycle" }

    /// Themes are the `<theme>__` prefixes of the animation names (`xmas__santa` is in `xmas`).
    public var themes: [String] {
        Array(Set(animations.compactMap { BuddyState.theme(of: $0) })).sorted()
    }

    /// Faces of no theme (`face_happy`); they cycle whatever the theme.
    public var commonFaces: [String] { animations.filter { BuddyState.theme(of: $0) == nil }.sorted() }

    public func faces(in theme: String) -> [String] {
        animations.filter { BuddyState.theme(of: $0) == theme }.sorted()
    }

    /// In the library but not on the buddy: playing one uploads it first (the bridge does).
    public var missing: [String] {
        let on = Set(animations)
        return library.filter { !on.contains($0) }.sorted()
    }

    /// Faces to offer for a theme ("" = no theme): the ones on the buddy, then the library's others.
    public func menuFaces(in theme: String) -> [(name: String, onBuddy: Bool)] {
        let have = theme.isEmpty ? commonFaces : faces(in: theme)
        let more = missing.filter { (BuddyState.theme(of: $0) ?? "") == theme }
        return have.map { ($0, true) } + more.map { ($0, false) }
    }

    /// Themes with a face on the buddy or in the library.
    public var menuThemes: [String] {
        Array(Set((animations + library).compactMap { BuddyState.theme(of: $0) })).sorted()
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

/// The panel's three ways to run the buddy. Manual and Cycle both pause the bridge (Claude Code
/// leaves the buddy alone); the buddy itself tells them apart: it cycles, or it stays on one face.
public enum BuddyMode: String, CaseIterable {
    case follow, manual, cycle

    public static func of(paused: Bool, buddy: BuddyState?) -> BuddyMode {
        guard paused else { return .follow }
        return buddy?.isCycling == true ? .cycle : .manual
    }
}

extension BuddyState {
    /// The face Manual settles on when the buddy is cycling: the last one picked if it is still
    /// stored, else the happy face, else the first face of no theme.
    public func manualFace(last: String?) -> String? {
        if let last, last != "cycle", animations.contains(last) { return last }
        if animations.contains("face_happy") { return "face_happy" }
        return commonFaces.first ?? animations.first
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
