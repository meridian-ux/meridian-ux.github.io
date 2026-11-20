import AppKit
import SwiftUI
import XCTest
import MeridianUI

@MainActor
final class GalleryCaptureTests: XCTestCase {
    func testExportNativePanels() async throws {
        let environment = ProcessInfo.processInfo.environment
        guard let output = environment["MERIDIAN_CAPTURE_OUTPUT"],
              let selection = environment["MERIDIAN_CAPTURE_FIXTURES"] else {
            throw XCTSkip("Screenshot capture is opt-in.")
        }
        let ids = Set(selection.split(separator: " ").map(String.init))
        let fixtures = try SchemaTests.fixtures().filter {
            ids.contains(URL(fileURLWithPath: $0.0).deletingPathExtension().lastPathComponent)
        }
        XCTAssertEqual(fixtures.count, ids.count)
        let directory = URL(fileURLWithPath: output, isDirectory: true)
        let size = NSSize(width: 640, height: 480)
        _ = NSApplication.shared

        for (name, panel) in fixtures {
            let id = URL(fileURLWithPath: name).deletingPathExtension().lastPathComponent
            let content = MeridianPanel(panel, host: MeridianHost())
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .padding(24)
                .frame(width: size.width, height: size.height)
                .background(Color(nsColor: .windowBackgroundColor))
                .environment(\.colorScheme, .light)
                .environment(\.locale, Locale(identifier: "en_US_POSIX"))
                .transaction { $0.animation = nil; $0.disablesAnimations = true }
            let host = NSHostingView(rootView: content)
            let window = NSWindow(
                contentRect: NSRect(origin: .zero, size: size), styleMask: [.borderless],
                backing: .buffered, defer: false
            )
            window.appearance = NSAppearance(named: .aqua)
            window.contentView = host
            defer { window.orderOut(nil) }
            host.frame = NSRect(origin: .zero, size: size)
            host.layoutSubtreeIfNeeded()
            window.displayIfNeeded()

            let bitmap = try XCTUnwrap(NSBitmapImageRep(
                bitmapDataPlanes: nil, pixelsWide: 1280, pixelsHigh: 960,
                bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0
            ))
            bitmap.size = size
            host.cacheDisplay(in: host.bounds, to: bitmap)
            let pixels = try XCTUnwrap(bitmap.bitmapData, id)
            let background = Int(pixels[0])
            let hasContent = stride(from: 0, to: bitmap.bytesPerRow * bitmap.pixelsHigh, by: 4)
                .contains { abs(Int(pixels[$0]) - background) > 32 }
            XCTAssertTrue(hasContent, "Blank or low-contrast capture: " + id)
            let png = try XCTUnwrap(bitmap.representation(using: .png, properties: [:]), id)
            try png.write(to: directory.appendingPathComponent(id + ".png"), options: .atomic)
        }
    }
}
