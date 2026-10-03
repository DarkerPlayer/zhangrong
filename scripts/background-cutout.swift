// Development utility for converting an already-approved character render into
// a transparent foreground cutout with macOS Vision. The source image is never
// modified; pass pairs of input and output paths.
import Foundation
import Vision
import CoreImage
import CoreGraphics

guard CommandLine.arguments.count >= 3,
      (CommandLine.arguments.count - 1).isMultiple(of: 2) else {
    fputs("usage: swift scripts/background-cutout.swift input.png output.png [...]\n", stderr)
    exit(2)
}

let context = CIContext(options: [.useSoftwareRenderer: false])
let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!

for index in stride(from: 1, to: CommandLine.arguments.count, by: 2) {
    let inputURL = URL(fileURLWithPath: CommandLine.arguments[index])
    let outputURL = URL(fileURLWithPath: CommandLine.arguments[index + 1])
    let handler = VNImageRequestHandler(url: inputURL, options: [:])
    let request = VNGenerateForegroundInstanceMaskRequest()
    try handler.perform([request])
    guard let result = request.results?.first else {
        throw NSError(domain: "BackgroundCutout", code: 1,
                      userInfo: [NSLocalizedDescriptionKey: "No foreground detected in \(inputURL.path)"])
    }
    let maskBuffer = try result.generateScaledMaskForImage(
        forInstances: result.allInstances,
        from: handler
    )
    guard let source = CIImage(contentsOf: inputURL) else {
        throw NSError(domain: "BackgroundCutout", code: 2,
                      userInfo: [NSLocalizedDescriptionKey: "Could not load \(inputURL.path)"])
    }
    let mask = CIImage(cvPixelBuffer: maskBuffer)
    let transparent = CIImage(color: .clear).cropped(to: source.extent)
    let cutout = source.applyingFilter(
        "CIBlendWithMask",
        parameters: [
            kCIInputBackgroundImageKey: transparent,
            kCIInputMaskImageKey: mask,
        ]
    ).cropped(to: source.extent)
    try context.writePNGRepresentation(
        of: cutout,
        to: outputURL,
        format: .RGBA8,
        colorSpace: colorSpace
    )
    print(outputURL.path)
}
