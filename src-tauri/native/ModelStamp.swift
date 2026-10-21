// SPDX-License-Identifier: AGPL-3.0-only
// Private bounded decoder uses read-only fd 0. The sandbox is a partial
// denylist, not a complete filesystem capability boundary; see SECURITY.md.
// No source paths, images, recognized words, timestamps or other OSD leave this process.
import AVFoundation
import Foundation
import Vision
@_silgen_name("sandbox_init")
private func initializeSandbox(_ profile: UnsafePointer<CChar>, _ flags: UInt64,
    _ error: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>?) -> Int32
@_silgen_name("sandbox_free_error")
private func freeSandboxError(_ error: UnsafeMutablePointer<CChar>?)

func compact(_ text: String) -> String {
    text.lowercased().unicodeScalars.filter { CharacterSet.alphanumerics.contains($0) }
        .map(String.init).joined()
}

// AVFoundation cannot decode /dev/fd URLs directly. A custom resource loader
// serves bounded pread calls from the inherited inode, never reopening a source path.
final class ReadOnlyVideo: NSObject, AVAssetResourceLoaderDelegate {
    let size: Int64
    let queue = DispatchQueue(label: "bounded-model-stamp.read")
    var total = 0
    init(size: Int64) { self.size = size }
    func pump(_ request: AVAssetResourceLoadingRequest) {
        guard !request.isCancelled, !request.isFinished else { return }
        guard let data = request.dataRequest else { request.finishLoading(); return }
        let offset = max(data.requestedOffset, data.currentOffset)
        let count = data.requestsAllDataToEndOfResource ? size - offset : Int64(data.requestedLength) - (offset - data.requestedOffset)
        guard offset >= 0, offset <= size, count >= 0, count <= size - offset,
              total <= 64 * 1024 * 1024 - 65536 else {
            request.finishLoading(with: NSError(domain: "BoundedMedia", code: 1)); return
        }
        if count == 0 { request.finishLoading(); return }
        var bytes = [UInt8](repeating: 0, count: Int(min(count, 65536)))
        let n = pread(STDIN_FILENO, &bytes, bytes.count, off_t(offset))
        guard n > 0 else {
            request.finishLoading(with: NSError(domain: "BoundedMedia", code: 2)); return
        }
        total += n
        data.respond(with: Data(bytes.prefix(n)))
        // Yield between chunks: AVFoundation can cancel a forward request and seek
        // to the tail moov without streaming a whole large recording into memory.
        queue.async { self.pump(request) }
    }
    func resourceLoader(_ loader: AVAssetResourceLoader,
                        shouldWaitForLoadingOfRequestedResource request: AVAssetResourceLoadingRequest) -> Bool {
        if let info = request.contentInformationRequest {
            info.contentType = "public.mpeg-4"
            info.contentLength = size
            info.isByteRangeAccessSupported = true
        }
        pump(request)
        return true
    }
}

@main
struct ModelStamp {
    static func main() {
        // Keep the main dispatch queue available to Apple's decoder/Vision services.
        DispatchQueue.global().async { run(); exit(0) }
        dispatchMain()
    }
    static func run() {
        // Parent also enforces a stricter per-file and whole-scan timeout/cancellation.
        DispatchQueue.global().asyncAfter(deadline: .now() + 70) { _exit(2) }
        guard CommandLine.arguments.count == 3,
              let data = CommandLine.arguments[1].data(using: .utf8),
              let stamps = try? JSONDecoder().decode([String].self, from: data),
              stamps.count <= 100, stamps.allSatisfy({ $0.count <= 100 }) else { _exit(2) }
        // Fail closed before touching untrusted video or calling Apple's decoder.
        // The parent constructs the profile from its validated native selection.
        var sandboxError: UnsafeMutablePointer<CChar>? = nil
        let applied = CommandLine.arguments[2].withCString {
            initializeSandbox($0, 0, &sandboxError)
        }
        if let sandboxError { freeSandboxError(sandboxError) }
        guard applied == 0 else { _exit(2) }
        var statBuffer = stat()
        guard fstat(STDIN_FILENO, &statBuffer) == 0,
              statBuffer.st_mode & S_IFMT == S_IFREG,
              fcntl(STDIN_FILENO, F_GETFL) & O_ACCMODE == O_RDONLY else { _exit(2) }
        let source = ReadOnlyVideo(size: statBuffer.st_size)
        let asset = AVURLAsset(url: URL(string: "bounded-model-stamp://local/video.mp4")!,
                               options: [AVURLAssetPreferPreciseDurationAndTimingKey: false])
        asset.resourceLoader.setDelegate(source, queue: source.queue)
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 2560, height: 1440)
        generator.requestedTimeToleranceBefore = .zero
        generator.requestedTimeToleranceAfter = CMTime(seconds: 0.15, preferredTimescale: 600)
        var matches = Set<Int>()
        var successfulFrames = 0
        // Fixed two frames, not proportional to clip length or whole-card file count.
        for seconds in [0.0, 1.0] {
            autoreleasepool {
                guard let image = try? generator.copyCGImage(
                    at: CMTime(seconds: seconds, preferredTimescale: 600), actualTime: nil),
                    let bottom = image.cropping(to: CGRect(x: 0, y: image.height * 3 / 4,
                        width: image.width, height: image.height - image.height * 3 / 4)) else { return }
                let request = VNRecognizeTextRequest()
                request.recognitionLevel = .accurate
                request.usesCPUOnly = true
                request.recognitionLanguages = ["en-US"]
                request.usesLanguageCorrection = false
                // No custom words: never bias absent/ambiguous stamps toward a candidate.
                guard (try? VNImageRequestHandler(cgImage: bottom).perform([request])) != nil else { return }
                successfulFrames += 1
                for observation in request.results ?? [] {
                    guard let text = observation.topCandidates(1).first, text.confidence >= 0.75 else { continue }
                    let token = compact(text.string)
                    // Whole observation equality, not substring: A119 != A119 Mini 2.
                    for (index, stamp) in stamps.enumerated() where token == compact(stamp) {
                        matches.insert(index)
                    }
                }
            }
        }
        withExtendedLifetime(source) {}
        generator.cancelAllCGImageGeneration()
        guard successfulFrames > 0 else { _exit(2) }
        print(matches.sorted().map(String.init).joined(separator: ","))
    }
}
