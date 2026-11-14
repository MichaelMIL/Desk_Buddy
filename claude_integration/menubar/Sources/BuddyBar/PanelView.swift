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

            Picker("Animations", selection: Binding(get: { monitor.mode }, set: { monitor.setMode($0) })) {
                Text("Follow Claude").tag(BuddyMode.follow)
                Text("Manual").tag(BuddyMode.manual)
                Text("Cycle").tag(BuddyMode.cycle)
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .disabled(!monitor.hooks.installed || monitor.working)
            .help("Follow Claude: the buddy shows what Claude Code is doing. "
                  + "Manual: Claude Code leaves it alone and the face you pick stays. "
                  + "Cycle: Claude Code leaves it alone and the buddy goes through its faces, plus the theme's.")

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
        .frame(width: 340)
        // the panel is this app's only window: key = open. The buddy is read only while it is open.
        .onAppear { monitor.panelOpened() }
        .onReceive(NotificationCenter.default.publisher(for: NSWindow.didBecomeKeyNotification)) { _ in
            monitor.panelOpened()
        }
        .onReceive(NotificationCenter.default.publisher(for: NSWindow.didResignKeyNotification)) { _ in
            monitor.panelClosed()
        }
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
                if let bat = monitor.buddy?.battery ?? s?.battery {
                    HStack(spacing: 3) {
                        Image(systemName: bat.symbol)
                        Text("\(bat.pct)%").monospacedDigit()
                    }
                    .foregroundStyle(bat.alert ? Color.red : Color.secondary)
                    .help(bat.help)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(bat.help)
                }
                if let s {
                    if !s.boardError.isEmpty {
                        badge("no answer", .red)
                    } else if let up = s.connected {
                        badge(up ? "connected" : "not connected", up ? .green : .secondary)
                    }
                }
            }
            .font(.callout)
            BuddyControls(monitor: monitor)
            if let s, s.active, let prev = s.previous {
                Text("Goes back to \(BuddyState.displayName(prev).lowercased()) when Claude is idle")
                    .font(.caption).foregroundStyle(.secondary)
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

/// What plays, brightness and screen, through the bridge daemon's link to the buddy; in Manual and
/// Cycle also next and the faces menu, and in Cycle the theme (Claude Code picks faces while followed).
struct BuddyControls: View {
    @ObservedObject var monitor: Monitor
    @State private var brightness = 100.0
    @State private var dragging = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if monitor.daemonTooOld {
                HStack {
                    Text("The running bridge predates the buddy controls.").foregroundStyle(.secondary)
                    Spacer(minLength: 4)
                    Button("Restart it") { monitor.restartDaemon() }.controlSize(.small)
                }
            } else if let b = monitor.buddy {
                controls(b)
            } else if monitor.buddyBusy {
                HStack(spacing: 8) {
                    ProgressView().controlSize(.small)
                    Text("Connecting to the buddy…").foregroundStyle(.secondary)
                }
            } else {
                HStack {
                    Button {
                        monitor.connectBuddy()
                    } label: {
                        Label("Show buddy controls", systemImage: "slider.horizontal.3")
                    }
                    .controlSize(.small)
                    if !monitor.daemonUp {
                        Text("starts the bridge").font(.caption).foregroundStyle(.tertiary)
                    }
                }
            }
            if let e = monitor.buddyError {
                Text(e).font(.caption).foregroundStyle(.red).fixedSize(horizontal: false, vertical: true)
            }
        }
        .font(.callout)
        .padding(.top, 2)
    }

    @ViewBuilder
    private func controls(_ b: BuddyState) -> some View {
        HStack(spacing: 6) {
            Image(systemName: b.isCycling ? "repeat" : "play.fill").foregroundStyle(.secondary).frame(width: 16)
            if let up = monitor.snapshot?.uploading {
                Text("Uploading \(BuddyState.displayName(up).lowercased())…")
                    .lineLimit(1).truncationMode(.middle).foregroundStyle(.secondary)
                    .help("Putting \(up) back on the buddy from the library")
            } else {
                Text(b.isCycling ? "Cycling faces" : BuddyState.displayName(b.current))
                    .lineLimit(1).truncationMode(.middle).help(b.current)
            }
            if monitor.buddyBusy || monitor.snapshot?.uploading != nil { ProgressView().controlSize(.mini) }
            Spacer(minLength: 4)
            if monitor.mode != .follow {                  // following Claude: its next step would override a pick
                if monitor.buddyCommands.contains("next") {
                    Button { monitor.send("next") } label: { Image(systemName: "forward.end.fill") }
                        .buttonStyle(.borderless).help("Next face")
                }
                facesMenu(b)
            }
        }
        HStack(spacing: 6) {
            Image(systemName: "sun.min").foregroundStyle(.secondary).frame(width: 16)
            Slider(value: $brightness, in: 10...100) { editing in
                dragging = editing
                if !editing {
                    brightness = (brightness / 5).rounded() * 5          // the buddy takes whole percents
                    monitor.send("brightness \(Int(brightness))")
                }
            }
            .controlSize(.small)
            Text("\(Int((brightness / 5).rounded() * 5))%").monospacedDigit().foregroundStyle(.secondary)
                .frame(width: 38, alignment: .trailing)
        }
        .help("Brightness")
        .onAppear { brightness = Double(b.brightness) }
        .onChange(of: b.brightness) { v in if !dragging { brightness = Double(v) } }
        HStack(spacing: 6) {
            Image(systemName: b.screen ? "display" : "moon")
                .foregroundStyle(.secondary).frame(width: 16)
            Toggle("Screen", isOn: Binding(get: { b.screen }, set: { monitor.send("screen \($0 ? "on" : "off")") }))
                .toggleStyle(.switch).controlSize(.mini)
            Spacer(minLength: 4)
        }
        if monitor.mode == .cycle {                     // the theme only decides which faces cycle
            HStack(spacing: 6) {
                Image(systemName: "rectangle.stack").foregroundStyle(.secondary).frame(width: 16)
                Text("Faces in the cycle")
                Spacer(minLength: 4)
                themePicker(b)
            }
        }
    }

    private func facesMenu(_ b: BuddyState) -> some View {
        Menu {
            ForEach(b.menuFaces(in: ""), id: \.name) { face in faceButton(face) }
            if !b.menuThemes.isEmpty { Divider() }
            ForEach(b.menuThemes, id: \.self) { t in
                Menu(t.capitalized + (t == b.theme ? "  ✦" : "")) {
                    ForEach(b.menuFaces(in: t), id: \.name) { face in faceButton(face) }
                }
            }
        } label: {
            Image(systemName: "square.grid.2x2")
        }
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
        .fixedSize()
        .help(monitor.mode == .cycle ? "Play a face (switches to Manual)" : "Play a face")
    }

    /// A face on the buddy plays at once; one only in the library is uploaded first (a few seconds).
    @ViewBuilder
    private func faceButton(_ face: (name: String, onBuddy: Bool)) -> some View {
        if face.onBuddy {
            Button(BuddyState.displayName(face.name)) { monitor.send("play \(face.name)") }
        } else {
            Button {
                monitor.send("play \(face.name)")
            } label: {
                Label(BuddyState.displayName(face.name) + " (upload)", systemImage: "arrow.down.circle")
            }
        }
    }

    private func themePicker(_ b: BuddyState) -> some View {
        let themes = b.themes + (b.theme.isEmpty || b.themes.contains(b.theme) ? [] : [b.theme])
        return Picker("Theme", selection: Binding(get: { b.theme },
                                                   set: { monitor.send("theme \($0.isEmpty ? "none" : $0)") })) {
            Text("Common faces").tag("")
            Divider()
            ForEach(themes, id: \.self) { Text("+ " + $0.capitalized).tag($0) }
        }
        .pickerStyle(.menu)
        .labelsHidden()
        .fixedSize()
        .help("Common faces always cycle; a theme adds its own faces")
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
