import AppKit
import SwiftProtobuf
import SwiftUI
import Vision
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
            let recordingPath = directory.appendingPathComponent(id + ".json")
            let recording: Google_Protobuf_Value?
            if FileManager.default.fileExists(atPath: recordingPath.path) {
                recording = try Google_Protobuf_Value(jsonUTF8Data: Data(contentsOf: recordingPath))
            } else {
                recording = .none
            }
            var didReplay = false
            let rpc = recording.map { response in
                MeridianRpcCapability(admit: { call, _ in
                    call == panel.table.populate ? .allow : .deny("")
                }, invoke: { _, _ in
                    didReplay = true
                    return response
                })
            }
            let content = MeridianPanel(panel, host: MeridianHost(rpc: rpc))
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
            if recording != nil {
                window.setFrameOrigin(NSPoint(x: -10_000, y: -10_000))
                window.orderBack(nil)
            }

            let bitmap = try XCTUnwrap(NSBitmapImageRep(
                bitmapDataPlanes: nil, pixelsWide: 1280, pixelsHigh: 960,
                bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0
            ))
            bitmap.size = size
            if recording != nil {
                // Repaint until SwiftUI commits the asynchronously populated rows.
                let recognition = VNRecognizeTextRequest()
                let deadline = ContinuousClock.now + .seconds(5)
                var rendered = false
                repeat {
                    try await Task.sleep(for: .milliseconds(50))
                    guard didReplay else { continue }
                    host.layoutSubtreeIfNeeded()
                    window.displayIfNeeded()
                    host.cacheDisplay(in: host.bounds, to: bitmap)
                    let image = try XCTUnwrap(bitmap.cgImage, id)
                    try VNImageRequestHandler(cgImage: image).perform([recognition])
                    let text = recognition.results?.compactMap { $0.topCandidates(1).first?.string }.joined(separator: " ") ?? ""
                    rendered = text.contains("Ada") && text.contains("Grace")
                } while !rendered && ContinuousClock.now < deadline
                XCTAssertTrue(rendered, "Capture did not show both canonical Table rows.")
            } else {
                host.cacheDisplay(in: host.bounds, to: bitmap)
            }
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
