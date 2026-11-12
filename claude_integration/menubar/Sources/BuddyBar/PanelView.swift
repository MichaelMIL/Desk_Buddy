import AppKit
import BuddyBarCore
import SwiftUI

/// The panel under the menu bar icon: state, the buddy link, sessions, recent plays, actions.
struct PanelView: View {
    @ObservedObject var monitor: Monitor

    var body: some View {
        let state = monitor.state
        let p = state.presentation
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Image(systemName: p.symbol)
                    .font(.system(size: 22, weight: .medium))
                    .foregroundStyle(tint(p.tone))
                    .frame(width: 32)
                VStack(alignment: .leading, spacing: 2) {
                    Text(p.title).font(.headline)
                    if !p.detail.isEmpty {
                        Text(p.detail).font(.callout).foregroundStyle(.secondary).lineLimit(2)
                    }
                }
                Spacer(minLength: 0)
            }

            buddy(state)
            if let s = monitor.snapshot {
                if !s.sessions.isEmpty { sessions(s.sessions) }
                if !s.recent.isEmpty { recent(s.recent) }
            }

            Divider()
            actions(state)
            if let m = monitor.message {
                Text(m).font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(14)
        .frame(width: 320)
    }

    // MARK: sections

    private func buddy(_ state: BridgeState) -> some View {
        let s = monitor.snapshot
        let link = s?.linkDescription ?? BridgeConfig.describe(host: monitor.config.host)
        let bluetooth = link.hasPrefix("Bluetooth")
        return VStack(alignment: .leading, spacing: 4) {
            heading("Buddy")
            HStack(spacing: 6) {
                Image(systemName: bluetooth ? "dot.radiowaves.left.and.right" : "wifi")
                    .foregroundStyle(.secondary).frame(width: 16)
                Text(link).lineLimit(1).truncationMode(.middle)
                Spacer(minLength: 4)
                if let s {
                    if !s.boardError.isEmpty {
                        badge("no answer", .red)
                    } else if let up = s.connected {
                        badge(up ? "connected" : "not connected", up ? .green : .secondary)
                    }
                }
            }
            .font(.callout)
            if let s, s.active, let prev = s.previous {
                Text("Goes back to \(prev) when Claude is idle").font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private func sessions(_ list: [Session]) -> some View {
        let sorted = list.sorted {
            $0.waitingForUser != $1.waitingForUser ? $0.waitingForUser : $0.lastEventSeconds < $1.lastEventSeconds
        }
        return VStack(alignment: .leading, spacing: 5) {
            heading("Sessions")
            ForEach(sorted) { s in
                HStack(spacing: 6) {
                    Image(systemName: Activity.symbol(s.waitingForUser ? "attention" : s.activity))
                        .foregroundStyle(s.waitingForUser ? Color.orange : .secondary)
                        .frame(width: 16)
                    Text(s.project).lineLimit(1).truncationMode(.middle)
                    Spacer(minLength: 4)
                    Text(s.waitingForUser ? "waiting for you"
                         : Activity.label(s.activity) + (s.subagents > 0 ? " · \(s.subagents) agents" : ""))
                        .foregroundStyle(s.waitingForUser ? Color.orange : .secondary)
                        .lineLimit(1)
                    Text(ago(s.lastEventSeconds))
                        .font(.caption).foregroundStyle(.tertiary)
                        .frame(width: 62, alignment: .trailing)
                }
                .font(.callout)
                .help(s.cwd)
            }
        }
    }

    private func recent(_ plays: [Play]) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            heading("Recently shown")
            ForEach(Array(plays.suffix(4).reversed().enumerated()), id: \.offset) { _, play in
                HStack(spacing: 8) {
                    Text(play.time).foregroundStyle(.tertiary)
                    Text(play.name).lineLimit(1).truncationMode(.tail)
                }
                .font(.caption.monospaced())
            }
        }
    }

    private func actions(_ state: BridgeState) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            if case .holding = state {
                MenuButton("End hold", symbol: "hand.raised.slash") { monitor.hold(0) }
            } else if state.isRunning {
                MenuButton("Leave the buddy alone for 2 min", symbol: "hand.raised") { monitor.hold(120) }
            }
            if monitor.config.enabled {
                MenuButton("Pause", symbol: "pause.circle") { monitor.setPaused(true) }
                    .disabled(!monitor.hooks.installed || monitor.working)
            } else {
                MenuButton("Resume", symbol: "play.circle") { monitor.setPaused(false) }
                    .disabled(!monitor.hooks.installed || monitor.working)
            }
            if state.isRunning {
                MenuButton("Stop the bridge until the next event", symbol: "stop.circle") { monitor.stopDaemon() }
            }
            MenuButton("Open log", symbol: "doc.text.magnifyingglass") { monitor.openLog() }
            Divider().padding(.vertical, 4)
            Toggle("Open at login", isOn: Binding(get: { monitor.openAtLogin },
                                                   set: { monitor.setOpenAtLogin($0) }))
                .toggleStyle(.checkbox)
                .padding(.horizontal, 8).padding(.vertical, 4)
            MenuButton("Quit Buddy Bridge", symbol: "power") { NSApp.terminate(nil) }
        }
    }

    // MARK: bits

    private func heading(_ text: String) -> some View {
        Text(text.uppercased()).font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
    }

    private func badge(_ text: String, _ color: Color) -> some View {
        HStack(spacing: 4) {
            Circle().fill(color).frame(width: 6, height: 6)
            Text(text).foregroundStyle(.secondary)
        }
        .font(.caption)
    }

    private func tint(_ tone: BridgeState.Tone) -> Color {
        switch tone {
        case .quiet: return .secondary
        case .good: return .green
        case .busy: return Color(red: 0.85, green: 0.47, blue: 0.34)    // Claude's terracotta
        case .attention: return .orange
        case .problem: return .red
        }
    }
}

/// A full-width row that highlights on hover, like a menu item.
struct MenuButton: View {
    let title: String
    let symbol: String
    let action: () -> Void
    @State private var hover = false
    @Environment(\.isEnabled) private var enabled

    init(_ title: String, symbol: String, action: @escaping () -> Void) {
        self.title = title; self.symbol = symbol; self.action = action
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: symbol).frame(width: 16)
                Text(title)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 8).padding(.vertical, 5)
            .contentShape(Rectangle())
            .background(RoundedRectangle(cornerRadius: 5)
                .fill(hover && enabled ? Color.accentColor.opacity(0.85) : .clear))
            .foregroundStyle(hover && enabled ? Color.white : .primary)
        }
        .buttonStyle(.plain)
        .onHover { hover = $0 }
    }
}
