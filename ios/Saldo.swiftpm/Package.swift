// swift-tools-version: 5.9

// WARNING:
// This is a Swift Playgrounds / Xcode app package. Open the Saldo.swiftpm
// folder in Swift Playgrounds (iPad or Mac) or in Xcode.

import PackageDescription
import AppleProductTypes

let package = Package(
    name: "Saldo",
    platforms: [
        .iOS("17.0")
    ],
    products: [
        .iOSApplication(
            name: "Saldo",
            targets: ["AppModule"],
            bundleIdentifier: "com.example.saldo",
            displayVersion: "1.0",
            bundleVersion: "1",
            supportedDeviceFamilies: [
                .pad,
                .phone
            ],
            supportedInterfaceOrientations: [
                .portrait,
                .landscapeRight,
                .landscapeLeft,
                .portraitUpsideDown(.when(deviceFamilies: [.pad]))
            ]
        )
    ],
    targets: [
        .executableTarget(
            name: "AppModule",
            path: "."
        )
    ]
)
