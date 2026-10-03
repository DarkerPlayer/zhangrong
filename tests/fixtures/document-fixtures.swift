import Foundation
import AppKit
import PDFKit
import CoreText

let directory = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
var box = CGRect(x: 0, y: 0, width: 400, height: 500)
let textURL = directory.appendingPathComponent("text.pdf")
let textContext = CGContext(textURL as CFURL, mediaBox: &box, nil)!
textContext.beginPDFPage(nil)
textContext.textPosition = CGPoint(x: 30, y: 440)
let line = CTLineCreateWithAttributedString(NSAttributedString(string: "Local text fixture. Hello again.", attributes: [.font: NSFont.systemFont(ofSize: 16)]))
CTLineDraw(line, textContext)
textContext.endPDFPage()
textContext.closePDF()

let scanContext = CGContext(directory.appendingPathComponent("scan.pdf") as CFURL, mediaBox: &box, nil)!
scanContext.beginPDFPage(nil)
let pixels = Data(repeating: 128, count: 16 * 16 * 3)
let provider = CGDataProvider(data: pixels as CFData)!
let image = CGImage(width: 16, height: 16, bitsPerComponent: 8, bitsPerPixel: 24, bytesPerRow: 48, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGBitmapInfo(rawValue: 0), provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent)!
scanContext.draw(image, in: box)
scanContext.endPDFPage()
scanContext.closePDF()

let encrypted = PDFDocument(url: textURL)!
guard encrypted.write(to: directory.appendingPathComponent("encrypted.pdf"), withOptions: [.userPasswordOption: "fixture-password", .ownerPasswordOption: "fixture-owner"]) else { exit(2) }
