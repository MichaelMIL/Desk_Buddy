import BuddyBarCore
import SwiftUI

/// Menu bar icon for the Claude Code bridge: its symbol follows what the bridge shows on the
/// buddy (reading, editing, needs you, ...), or says it is paused / not running.
@main
struct BuddyBarApp: App {
    @StateObject private var monitor = Monitor()

    var body: some Scene {
        MenuBarExtra {
            PanelView(monitor: monitor)
        } label: {
            let p = monitor.state.presentation
            Image(systemName: p.symbol)
                .accessibilityLabel("Claude Code bridge: \(p.title)")
        }
        .menuBarExtraStyle(.window)
    }
}
