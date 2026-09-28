// Development-only landmark extraction for original artwork. Does not alter PNGs.
// Run: swift scripts/face-landmarks.swift public/looks/<id>/character.png ...
import Foundation
import Vision

for path in CommandLine.arguments.dropFirst() {
    do {
        let request = VNDetectFaceLandmarksRequest()
        try VNImageRequestHandler(url: URL(fileURLWithPath: path), options: [:]).perform([request])
        guard let face = request.results?.max(by: { $0.confidence < $1.confidence }),
              let landmarks = face.landmarks else {
            throw NSError(domain: "RigCalibration", code: 1, userInfo: [NSLocalizedDescriptionKey: "No face detected"])
        }
        let box = face.boundingBox
        func feature(_ region: VNFaceLandmarkRegion2D?) -> [String: Double] {
            guard let points = region?.normalizedPoints, !points.isEmpty else { return [:] }
            let xs = points.map { Double(box.minX + $0.x * box.width) }
            let ys = points.map { Double(1 - (box.minY + $0.y * box.height)) }
            let left = xs.min()!, right = xs.max()!, top = ys.min()!, bottom = ys.max()!
            return ["x": (left + right) / 2, "y": (top + bottom) / 2,
                    "rx": (right - left) / 2, "ry": (bottom - top) / 2]
        }
        let eyes = [feature(landmarks.leftEye), feature(landmarks.rightEye)].sorted { ($0["x"] ?? 0) < ($1["x"] ?? 0) }
        let output: [String: Any] = [
            "path": path, "confidence": face.confidence,
            "face": ["left": box.minX, "right": box.maxX, "top": 1-box.maxY, "bottom": 1-box.minY],
            "eyes": eyes, "mouth": feature(landmarks.outerLips)
        ]
        let data = try JSONSerialization.data(withJSONObject: output, options: [.sortedKeys])
        print(String(decoding: data, as: UTF8.self))
    } catch {
        let data = try! JSONSerialization.data(withJSONObject: ["path": path, "error": error.localizedDescription])
        print(String(decoding: data, as: UTF8.self))
    }
}
