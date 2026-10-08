import AppKit
import ApplicationServices
import Foundation
import AVFoundation
import MediaToolbox
import Accelerate

final class MicrophoneGainState {
    let gain: Float
    var supported = false
    var processedSamples: Int64 = 0
    var error: OSStatus = noErr

    init(gain: Float) { self.gain = gain }
}

func microphoneAudioMix(tracks: [AVAssetTrack], gain: Float) throws -> (AVAudioMix, [MicrophoneGainState]) {
    let mix = AVMutableAudioMix()
    var states: [MicrophoneGainState] = []
    var parameters: [AVAudioMixInputParameters] = []
    for track in tracks {
        let state = MicrophoneGainState(gain: gain)
        let retained = Unmanaged.passRetained(state)
        var callbacks = MTAudioProcessingTapCallbacks(
            version: kMTAudioProcessingTapCallbacksVersion_0,
            clientInfo: retained.toOpaque(),
            init: { _, info, storage in storage.pointee = info },
            finalize: { tap in
                Unmanaged<MicrophoneGainState>.fromOpaque(MTAudioProcessingTapGetStorage(tap)).release()
            },
            prepare: { tap, _, format in
                let state = Unmanaged<MicrophoneGainState>.fromOpaque(MTAudioProcessingTapGetStorage(tap)).takeUnretainedValue()
                state.supported = format.pointee.mFormatID == kAudioFormatLinearPCM
                    && format.pointee.mFormatFlags & kAudioFormatFlagIsFloat != 0
                    && format.pointee.mBitsPerChannel == 32
            },
            unprepare: nil,
            process: { tap, frames, _, buffers, framesOut, flagsOut in
                let state = Unmanaged<MicrophoneGainState>.fromOpaque(MTAudioProcessingTapGetStorage(tap)).takeUnretainedValue()
                let status = MTAudioProcessingTapGetSourceAudio(tap, frames, buffers, flagsOut, nil, framesOut)
                guard status == noErr, state.supported else {
                    state.error = status == noErr ? kAudioFormatUnsupportedDataFormatError : status
                    return
                }
                for buffer in UnsafeMutableAudioBufferListPointer(buffers) {
                    guard let data = buffer.mData else { continue }
                    let count = min(Int(buffer.mDataByteSize) / MemoryLayout<Float>.size, Int(framesOut.pointee) * Int(buffer.mNumberChannels))
                    let samples = data.assumingMemoryBound(to: Float.self)
                    var gain = state.gain
                    var minimum: Float = -1
                    var maximum: Float = 1
                    vDSP_vsmul(samples, 1, &gain, samples, 1, vDSP_Length(count))
                    vDSP_vclip(samples, 1, &minimum, &maximum, samples, 1, vDSP_Length(count))
                    state.processedSamples += Int64(count)
                }
            }
        )
        var tap: MTAudioProcessingTap?
        let status = MTAudioProcessingTapCreate(kCFAllocatorDefault, &callbacks, kMTAudioProcessingTapCreationFlag_PostEffects, &tap)
        guard status == noErr, let tap else {
            retained.release()
            throw NSError(domain: "Coach", code: Int(status), userInfo: [NSLocalizedDescriptionKey: "无法准备麦克风音轨增益。"])
        }
        let input = AVMutableAudioMixInputParameters(track: track)
        input.audioTapProcessor = tap
        parameters.append(input)
        states.append(state)
    }
    mix.inputParameters = parameters
    return (mix, states)
}

struct CanvasLocation: Codable {
    let x: Double
    let y: Double
    let width: Double
    let height: Double
    let pid: Int32
    let visible: Bool
}

func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else { return nil }
    return value
}

func stringAttribute(_ element: AXUIElement, _ name: String) -> String? {
    if let value = attribute(element, name) as? String { return value }
    if let value = attribute(element, name) as? URL { return value.absoluteString }
    return nil
}

func windowAttribute(_ element: AXUIElement, _ name: String) -> AXUIElement? {
    guard let value = attribute(element, name), CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }
    return (value as! AXUIElement)
}

func matchesOrigin(_ value: String?, _ expected: URL) -> Bool {
    guard let value, let url = URL(string: value) else { return false }
    return url.scheme == expected.scheme && url.host == expected.host && url.port == expected.port
}

func findCanvas(_ element: AXUIElement, origin: URL, scoped: Bool = false, depth: Int = 0, budget: inout Int) -> AXUIElement? {
    guard depth < 45, budget > 0 else { return nil }
    budget -= 1
    let role = stringAttribute(element, kAXRoleAttribute)
    var inside = scoped
    if role == "AXWebArea" {
        inside = matchesOrigin(stringAttribute(element, kAXURLAttribute) ?? stringAttribute(element, kAXDocumentAttribute), origin)
        if !inside { return nil }
    }
    let label = stringAttribute(element, kAXDescriptionAttribute) ?? stringAttribute(element, kAXTitleAttribute)
    if inside && role != kAXStaticTextRole && (label == "录制画布（16:9）" || stringAttribute(element, kAXIdentifierAttribute) == "coach-recording-canvas") {
        return element
    }
    for child in attribute(element, kAXChildrenAttribute) as? [AXUIElement] ?? [] where !CFEqual(child, element) {
        if let result = findCanvas(child, origin: origin, scoped: inside, depth: depth + 1, budget: &budget) { return result }
    }
    return nil
}

func rectangle(_ element: AXUIElement) -> CGRect? {
    guard let p = attribute(element, kAXPositionAttribute), let s = attribute(element, kAXSizeAttribute),
          CFGetTypeID(p) == AXValueGetTypeID(), CFGetTypeID(s) == AXValueGetTypeID() else { return nil }
    var position = CGPoint.zero
    var size = CGSize.zero
    guard AXValueGetValue(p as! AXValue, .cgPoint, &position), AXValueGetValue(s as! AXValue, .cgSize, &size) else { return nil }
    guard size.width >= 160, size.height >= 90, abs(size.width / size.height - 16 / 9) < 0.02 else { return nil }
    return CGRect(origin: position, size: size)
}

func locate(origin: URL, activate: Bool) throws -> CanvasLocation {
    guard AXIsProcessTrusted() else {
        throw NSError(domain: "Coach", code: 1, userInfo: [NSLocalizedDescriptionKey: "请在系统设置 → 隐私与安全性 → 辅助功能中，允许运行 coach 的终端访问浏览器。"])
    }
    let frontmost = NSWorkspace.shared.frontmostApplication?.processIdentifier
    let applications = NSWorkspace.shared.runningApplications.sorted { ($0.processIdentifier == frontmost ? 0 : 1) < ($1.processIdentifier == frontmost ? 0 : 1) }
    for app in applications {
        let identifier = app.bundleIdentifier ?? ""
        guard app.activationPolicy == .regular,
              identifier.contains("browser") || identifier.contains("Browser") || identifier.contains("Chrome") || identifier.contains("Safari") || identifier.contains("firefox") || identifier.contains("edgemac") || identifier.contains("thebrowser") || identifier.contains("Chromium") else { continue }
        let root = AXUIElementCreateApplication(app.processIdentifier)
        AXUIElementSetMessagingTimeout(root, 1)
        _ = attribute(root, kAXRoleAttribute)
        Thread.sleep(forTimeInterval: 0.8)
        let focused = windowAttribute(root, kAXFocusedWindowAttribute)
        var windows = attribute(root, kAXWindowsAttribute) as? [AXUIElement] ?? []
        if let focused { windows = [focused] + windows.filter { !CFEqual($0, focused) } }
        for window in windows {
            var budget = 15000
            guard let canvas = findCanvas(window, origin: origin, budget: &budget) else { continue }
            if activate {
                _ = AXUIElementPerformAction(window, kAXRaiseAction as CFString)
                _ = app.activate(options: [])
                Thread.sleep(forTimeInterval: 0.25)
            }
            guard let rect = rectangle(canvas) else { continue }
            let activeWindow = windowAttribute(root, kAXFocusedWindowAttribute)
            let front = NSWorkspace.shared.frontmostApplication
            let systemOverlay = ["com.apple.screencaptureui", "com.apple.systemuiserver"].contains(front?.bundleIdentifier ?? "")
            let visible = ((attribute(root, kAXFrontmostAttribute) as? Bool) == true || systemOverlay) && activeWindow.map { CFEqual($0, window) } == true
            return CanvasLocation(x: rect.minX, y: rect.minY, width: rect.width, height: rect.height, pid: app.processIdentifier, visible: visible)
        }
    }
    throw NSError(domain: "Coach", code: 2, userInfo: [NSLocalizedDescriptionKey: "没有找到当前网页的录制画布。请在浏览器中打开演讲模式，再点击 Mac 录制。"])
}

@main
struct CoachCanvas {
    @MainActor static func main() async {
        do {
            if CommandLine.arguments.count == 3 && CommandLine.arguments[1] == "--picker-info" {
                let information: [String: Any] = [
                    "CFBundleName": "Coach Recorder", "CFBundleDisplayName": "Coach Recorder",
                    "CFBundleIdentifier": "io.gevico.coach.recorder", "CFBundleExecutable": "mac-canvas",
                    "CFBundlePackageType": "APPL", "CFBundleVersion": "1", "LSUIElement": true,
                    "NSHighResolutionCapable": true
                ]
                let data = try PropertyListSerialization.data(fromPropertyList: information, format: .xml, options: 0)
                try data.write(to: URL(fileURLWithPath: CommandLine.arguments[2]), options: .atomic)
                print("{}")
                return
            }
            if [3, 4].contains(CommandLine.arguments.count) && CommandLine.arguments[1] == "--choose-directory" {
                let app = NSApplication.shared
                app.setActivationPolicy(.accessory)
                app.finishLaunching()
                if #available(macOS 14.0, *) { app.activate() }
                else { app.activate(ignoringOtherApps: true) }
                let panel = NSOpenPanel()
                panel.title = "Coach 录像保存目录"
                panel.message = "选择用于保存后续录像的文件夹。"
                panel.prompt = "选择并保存"
                panel.canChooseDirectories = true
                panel.canChooseFiles = false
                panel.canCreateDirectories = true
                panel.allowsMultipleSelection = false
                panel.directoryURL = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
                let result = panel.runModal()
                let value: [String: Any] = result == .OK && panel.url != nil ? ["directory": panel.url!.path] : ["cancelled": true]
                let data = try JSONSerialization.data(withJSONObject: value)
                if CommandLine.arguments.count == 4 {
                    try data.write(to: URL(fileURLWithPath: CommandLine.arguments[3]), options: .atomic)
                } else { print(String(decoding: data, as: UTF8.self)) }
                return
            }
            if [5, 6].contains(CommandLine.arguments.count) && CommandLine.arguments[1] == "--finalize-video" {
                let asset = AVURLAsset(url: URL(fileURLWithPath: CommandLine.arguments[2]))
                let duration = try await asset.load(.duration)
                let gain = CommandLine.arguments.count == 6 ? Float(CommandLine.arguments[5]) : 1
                guard let seconds = Double(CommandLine.arguments[4]), seconds.isFinite, seconds >= 0,
                      let gain, [Float(1), Float(2)].contains(gain),
                      duration.seconds > seconds,
                      let exporter = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetHighestQuality) else {
                    throw NSError(domain: "Coach", code: 5, userInfo: [NSLocalizedDescriptionKey: "准备结束后的录制时间过短，没有可以保存的视频内容。"])
                }
                let start = CMTime(seconds: seconds, preferredTimescale: 600)
                exporter.timeRange = CMTimeRange(start: start, duration: CMTimeSubtract(duration, start))
                var gainStates: [MicrophoneGainState] = []
                if gain > 1 {
                    let tracks = try await asset.loadTracks(withMediaType: .audio)
                    if !tracks.isEmpty {
                        let (mix, states) = try microphoneAudioMix(tracks: tracks, gain: gain)
                        exporter.audioMix = mix
                        gainStates = states
                    }
                }
                let destination = URL(fileURLWithPath: CommandLine.arguments[3])
                if #available(macOS 15.0, *) {
                    try await exporter.export(to: destination, as: .mov)
                } else {
                    exporter.outputURL = destination
                    exporter.outputFileType = .mov
                    await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
                        exporter.exportAsynchronously { continuation.resume() }
                    }
                    if exporter.status != .completed {
                        throw exporter.error ?? NSError(domain: "Coach", code: 6, userInfo: [NSLocalizedDescriptionKey: "无法保存录制视频。"])
                    }
                }
                guard gainStates.allSatisfy({ $0.error == noErr && $0.processedSamples > 0 }) else {
                    throw NSError(domain: "Coach", code: 7, userInfo: [NSLocalizedDescriptionKey: "无法处理麦克风音轨增益，请保留原始录制文件。"])
                }
                let data = try JSONSerialization.data(withJSONObject: ["sourceDuration": duration.seconds, "removedSeconds": seconds, "microphoneGain": gainStates.isEmpty ? 1 : gain])
                print(String(decoding: data, as: UTF8.self))
                return
            }
            if CommandLine.arguments.count == 3 && CommandLine.arguments[1] == "--inspect-video" {
                let asset = AVURLAsset(url: URL(fileURLWithPath: CommandLine.arguments[2]))
                let duration = try await asset.load(.duration)
                let videos = try await asset.loadTracks(withMediaType: .video)
                let audios = try await asset.loadTracks(withMediaType: .audio)
                guard let video = videos.first, duration.seconds.isFinite && duration.seconds > 0 else {
                    throw NSError(domain: "Coach", code: 4, userInfo: [NSLocalizedDescriptionKey: "录制文件没有有效的视频内容。"])
                }
                let size = try await video.load(.naturalSize)
                let data = try JSONSerialization.data(withJSONObject: ["duration": duration.seconds, "width": size.width, "height": size.height, "audioTracks": audios.count])
                print(String(decoding: data, as: UTF8.self))
                return
            }
            guard CommandLine.arguments.count >= 2, let origin = URL(string: CommandLine.arguments[1]), ["127.0.0.1", "localhost"].contains(origin.host ?? "") else {
                throw NSError(domain: "Coach", code: 3, userInfo: [NSLocalizedDescriptionKey: "录制网页地址无效。"])
            }
            let location = try locate(origin: origin, activate: CommandLine.arguments.contains("--activate"))
            let data = try JSONEncoder().encode(location)
            print(String(decoding: data, as: UTF8.self))
        } catch {
            let data = try! JSONSerialization.data(withJSONObject: ["error": error.localizedDescription])
            print(String(decoding: data, as: UTF8.self))
            exit(1)
        }
    }
}
