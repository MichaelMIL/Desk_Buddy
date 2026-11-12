// swift-tools-version:5.9
// Buddy Bridge: a menu bar app that shows whether the Claude Code bridge
// (../buddy_bridge.py) is running and what it shows on the desk buddy.
// Build the .app with ./build.sh; test with `swift test`.
import PackageDescription

let package = Package(
    name: "BuddyBar",
    platforms: [.macOS(.v13)],
    targets: [
        .target(name: "BuddyBarCore"),
        .executableTarget(name: "BuddyBar", dependencies: ["BuddyBarCore"]),
        .testTarget(name: "BuddyBarCoreTests", dependencies: ["BuddyBarCore"]),
    ]
)
