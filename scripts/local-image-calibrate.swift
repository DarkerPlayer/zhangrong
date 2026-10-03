// On-device Vision foreground extraction and landmarks. Inputs are never uploaded.
import Foundation
import Vision
import CoreImage
import CoreGraphics

do {
    guard CommandLine.arguments.count == 4 else {
        throw NSError(domain: "LocalStudio", code: 2, userInfo: [NSLocalizedDescriptionKey: "usage: muyu-calibrate input.png cutout.png landmarks.json"])
    }
    let input = URL(fileURLWithPath: CommandLine.arguments[1])
    let output = URL(fileURLWithPath: CommandLine.arguments[2])
    let landmarksURL = URL(fileURLWithPath: CommandLine.arguments[3])
    let handler = VNImageRequestHandler(url: input, options: [:])
    let faceRequest = VNDetectFaceLandmarksRequest()
    try handler.perform([faceRequest])
    let candidates = (faceRequest.results ?? []).filter { 1 - $0.boundingBox.midY < 0.45 && $0.boundingBox.height > 0.025 }
    guard candidates.count == 1, let face = candidates.first, let landmarks = face.landmarks else {
        throw NSError(domain: "LocalStudio", code: 3, userInfo: [NSLocalizedDescriptionKey: "未检测到清晰的单人面部。请换一张正脸参考图，描述为单人全身、面向镜头，然后重试。"])
    }
    let box = face.boundingBox
    func feature(_ region: VNFaceLandmarkRegion2D?) -> [String: Double] {
        guard let points = region?.normalizedPoints, !points.isEmpty else { return [:] }
        let xs = points.map { Double(box.minX + $0.x * box.width) }
        let ys = points.map { Double(1 - (box.minY + $0.y * box.height)) }
        let left = xs.min()!, right = xs.max()!, top = ys.min()!, bottom = ys.max()!
        return ["x": (left + right) / 2, "y": (top + bottom) / 2, "rx": (right - left) / 2, "ry": (bottom - top) / 2]
    }
    let eyes = [feature(landmarks.leftEye), feature(landmarks.rightEye)].sorted { ($0["x"] ?? 0) < ($1["x"] ?? 0) }
    let detected: [String: Any] = ["confidence": face.confidence,
        "face": ["left": box.minX, "right": box.maxX, "top": 1 - box.maxY, "bottom": 1 - box.minY],
        "eyes": eyes, "mouth": feature(landmarks.outerLips)]
    let foreground = VNGenerateForegroundInstanceMaskRequest()
    try handler.perform([foreground])
    guard let result = foreground.results?.first, !result.allInstances.isEmpty, let source = CIImage(contentsOf: input) else {
        throw NSError(domain: "LocalStudio", code: 4, userInfo: [NSLocalizedDescriptionKey: "未能识别人物轮廓。请使用简单背景，并确保人物完整可见。"])
    }
    let mask = try result.generateScaledMaskForImage(forInstances: result.allInstances, from: handler)
    let cutout = source.applyingFilter("CIBlendWithMask", parameters: [kCIInputBackgroundImageKey: CIImage(color: .clear).cropped(to: source.extent), kCIInputMaskImageKey: CIImage(cvPixelBuffer: mask)]).cropped(to: source.extent)
    let context = CIContext(options: [.useSoftwareRenderer: false])
    try context.writePNGRepresentation(of: cutout, to: output, format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!)
    try JSONSerialization.data(withJSONObject: detected, options: [.sortedKeys]).write(to: landmarksURL)
} catch {
    fputs(error.localizedDescription + "\n", stderr)
    exit(1)
}
