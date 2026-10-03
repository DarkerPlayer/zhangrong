import Foundation
import PDFKit

func output(_ value: [String: Any], status: Int32 = 0) -> Never {
    if let bytes = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]) {
        FileHandle.standardOutput.write(bytes)
    }
    exit(status)
}
func fail(_ message: String) -> Never { output(["error": message], status: 2) }

if CommandLine.arguments.count == 2 && CommandLine.arguments[1] == "--version" {
    output(["parser": "muyu-pdf-text", "version": 1])
}
guard CommandLine.arguments.count == 2 else { fail("请选择一个 PDF 文件。") }
let url = URL(fileURLWithPath: CommandLine.arguments[1])
guard let size = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize, size <= 20 * 1024 * 1024 else { fail("PDF 文件不能超过 20 MiB。") }
guard let document = PDFDocument(url: url) else { fail("PDF 文件损坏或无法读取。") }
guard !document.isEncrypted && !document.isLocked else { fail("暂不支持加密 PDF，请先导出不带密码的文字 PDF。") }
guard document.pageCount > 0 && document.pageCount <= 1000 else { fail("PDF 页数为空或超过 1,000 页，请分章导入。") }
var sections: [[String: Any]] = []
var characters = 0
var emptyPages = 0
for index in 0..<document.pageCount {
    autoreleasepool {
        guard let page = document.page(at: index) else { fail("PDF 页面无法读取。") }
        let text = (page.string ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        characters += text.utf16.count
        guard characters <= 1_000_000 else { fail("PDF 文字超过 1,000,000 字，请分章导入。") }
        if text.isEmpty { emptyPages += 1 }
        else { sections.append(["text": text, "chapter": "第\(index + 1)页", "page": index + 1, "paragraph": 1]) }
    }
}
guard !sections.isEmpty else { fail("未发现可提取文字，可能是扫描件或字体编码受限。当前不做 OCR，请导出 TXT 或文字 PDF 后导入。") }
output(["sections": sections, "warnings": emptyPages > 0 ? ["\(emptyPages) 页没有可提取文字，已略过；图片内容未做 OCR。"] : []])
