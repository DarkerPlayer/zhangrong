"""Bounded local EPUB/DOCX text reader. No archive members are extracted to disk."""
import json
import os
import posixpath
import stat
import struct
import sys
import zipfile
from html.parser import HTMLParser
from urllib.parse import unquote, urlsplit
from xml.parsers import expat

MAX_MEMBERS = 2048
MAX_MEMBER = 8 * 1024 * 1024
MAX_EXPANDED = 64 * 1024 * 1024
MAX_CHARACTERS = 1_000_000
MAX_SECTIONS = 10_000


def reject(message):
    raise ValueError(message)


def local_name(name):
    return name.rsplit("|", 1)[-1].split(":")[-1]


def safe_path(name, parent=""):
    parts = urlsplit(name)
    if parts.scheme or parts.netloc or "\\" in name or "\x00" in name:
        reject("文档包含外部资源或不安全路径。")
    path = unquote(parts.path)
    if path.startswith("/"):
        reject("文档包含不安全路径。")
    path = posixpath.normpath(posixpath.join(parent, path))
    if path in ("", ".", "..") or path.startswith("../"):
        reject("文档包含不安全路径。")
    return path


def archive(path):
    # Inspect the small central-directory footer before ZipFile allocates its
    # per-member objects. Do not accept ZIP64/multi-volume books at these limits.
    size = os.path.getsize(path)
    if size > 20 * 1024 * 1024:
        reject("文件不能超过 20 MiB。")
    with open(path, "rb") as stream:
        stream.seek(max(0, size - 65557))
        tail = stream.read()
    at = tail.rfind(b"PK\x05\x06")
    if at < 0 or at + 22 > len(tail):
        reject("压缩文档不完整。")
    _, disk, central_disk, on_disk, count, central_size, central_offset, comment = struct.unpack_from("<4s4H2LH", tail, at)
    if disk or central_disk or on_disk != count or count > MAX_MEMBERS or central_size > 4 * 1024 * 1024 or central_offset == 0xFFFFFFFF:
        reject("压缩文档条目过多或格式不受支持。")
    if at + 22 + comment != len(tail) or central_offset + central_size > size:
        reject("压缩文档目录无效。")
    book = zipfile.ZipFile(path)
    seen, expanded = set(), 0
    try:
        if len(book.infolist()) > MAX_MEMBERS:
            reject("压缩文档条目过多。")
        for entry in book.infolist():
            normalized = safe_path(entry.filename.rstrip("/"))
            if ".." in entry.filename.split("/") or normalized in seen:
                reject("压缩文档包含重复或不安全路径。")
            seen.add(normalized)
            if stat.S_ISLNK(entry.external_attr >> 16) or entry.flag_bits & 1:
                reject("不支持加密文档或符号链接。")
            if entry.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
                reject("文档使用了不受支持的压缩方式。")
            expanded += entry.file_size
            if entry.file_size > MAX_MEMBER or expanded > MAX_EXPANDED or entry.file_size > max(1, entry.compress_size) * 200:
                reject("压缩文档展开后过大，请分章导入。")
        book.muyu_read_bytes = 0
        return book
    except Exception:
        book.close()
        raise


def chunks(book, name):
    size = 0
    with book.open(name) as stream:
        while True:
            block = stream.read(65536)
            if not block:
                return
            size += len(block)
            if size > MAX_MEMBER:
                reject("文档章节展开后过大。")
            book.muyu_read_bytes += len(block)
            if book.muyu_read_bytes > MAX_EXPANDED:
                reject("文档累计读取展开后过大，请分章导入。")
            yield block


def parse_xml(blocks, start=lambda _n, _a: None, end=lambda _n: None, text=lambda _t: None):
    parser = expat.ParserCreate(namespace_separator="|")
    depth = 0

    def open_tag(name, attrs):
        nonlocal depth
        depth += 1
        if depth > 64:
            reject("文档结构嵌套过深。")
        start(local_name(name), {local_name(key): value for key, value in attrs.items()})

    def close_tag(name):
        nonlocal depth
        end(local_name(name))
        depth -= 1

    parser.StartElementHandler = open_tag
    parser.EndElementHandler = close_tag
    parser.CharacterDataHandler = text
    parser.StartDoctypeDeclHandler = lambda *_: reject("不支持含 DTD 或外部实体的文档。")
    parser.EntityDeclHandler = lambda *_: reject("不支持含实体声明的文档。")
    parser.ExternalEntityRefHandler = lambda *_: reject("不支持文档中的外部引用。")
    for block in blocks:
        parser.Parse(block, False)
    parser.Parse(b"", True)


class Sections:
    def __init__(self):
        self.items = []
        self.characters = 0

    def add(self, text, chapter, paragraph=1):
        text = text.replace("\r\n", "\n").replace("\r", "\n").strip()
        if not text:
            return
        self.characters += len(text.encode("utf-16-le")) // 2
        if self.characters > MAX_CHARACTERS or len(self.items) >= MAX_SECTIONS:
            reject("文档文字超过 1,000,000 字或段落过多，请分章导入。")
        self.items.append({"text": text, "chapter": chapter[:160], "paragraph": paragraph})


def docx(book):
    sections = Sections()
    paragraph, values, in_text, count = 0, [], False, 0

    def append(value):
        nonlocal count
        count += len(value)
        if count > MAX_CHARACTERS:
            reject("文档文字超过 1,000,000 字，请分章导入。")
        values.append(value)

    def start(name, _attrs):
        nonlocal paragraph, values, in_text
        if name == "p":
            paragraph += 1
            values = []
        elif name == "t":
            in_text = True
        elif name == "tab":
            append("\t")
        elif name in ("br", "cr"):
            append("\n")

    def end(name):
        nonlocal in_text
        if name == "t":
            in_text = False
        elif name == "p":
            sections.add("".join(values), "正文", paragraph)

    parse_xml(chunks(book, "word/document.xml"), start, end, lambda value: append(value) if in_text else None)
    return sections.items


class ChapterHTML(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.values, self.title_values = [], []
        self.hidden = 0
        self.head = False
        self.title = False
        self.size = 0

    def handle_starttag(self, tag, _attrs):
        if tag in ("script", "style", "svg", "math"):
            self.hidden += 1
        if tag == "head":
            self.head = True
        if tag == "title":
            self.title = True
        if not self.hidden and tag in ("p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "blockquote"):
            self.values.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "svg", "math"):
            self.hidden = max(0, self.hidden - 1)
        if tag == "head":
            self.head = False
        if tag == "title":
            self.title = False
        if not self.hidden and tag in ("p", "div", "li", "tr", "h1", "h2", "h3", "h4", "blockquote"):
            self.values.append("\n")

    def handle_decl(self, decl):
        # XHTML books commonly declare a public DTD. HTMLParser never fetches
        # it; accepting that declaration does not enable entity resolution.
        if "[" in decl or "ENTITY" in decl.upper():
            reject("不支持章节中的实体声明。")

    def handle_data(self, value):
        self.size += len(value)
        if self.size > MAX_CHARACTERS:
            reject("文档文字超过 1,000,000 字，请分章导入。")
        if self.title:
            self.title_values.append(value)
        if not self.hidden and not self.head:
            self.values.append(value)


def epub(book):
    roots = []
    parse_xml(chunks(book, "META-INF/container.xml"), lambda name, attrs: roots.append(attrs.get("full-path", "")) if name == "rootfile" else None)
    if not roots:
        reject("EPUB 缺少内容目录。")
    package = safe_path(roots[0])
    manifest, spine = {}, []

    def package_tag(name, attrs):
        if name == "item" and attrs.get("id"):
            manifest[attrs["id"]] = attrs
        elif name == "itemref" and attrs.get("linear") != "no":
            spine.append(attrs.get("idref"))

    parse_xml(chunks(book, package), package_tag)
    if not spine or len(spine) > MAX_MEMBERS:
        reject("EPUB 缺少可读取的章节顺序。")
    sections = Sections()
    for key in spine:
        item = manifest.get(key)
        if not item or not item.get("href"):
            reject("EPUB 章节引用无效。")
        name = safe_path(item["href"], posixpath.dirname(package))
        data = b"".join(chunks(book, name))
        try:
            text = data.decode("utf-8-sig")
        except UnicodeDecodeError:
            reject("EPUB 章节编码无效，请转换为 UTF-8 文本。")
        parser = ChapterHTML()
        parser.feed(text)
        parser.close()
        title = "".join(parser.title_values).strip() or posixpath.basename(name)
        sections.add("".join(parser.values), title)
    return sections.items


def main():
    if len(sys.argv) != 3 or sys.argv[1] not in ("epub", "docx"):
        reject("文档格式无效。")
    with archive(sys.argv[2]) as book:
        sections = epub(book) if sys.argv[1] == "epub" else docx(book)
    if not sections:
        reject("文档中没有可提取的文字。")
    print(json.dumps({"sections": sections, "warnings": []}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        message = str(error) if isinstance(error, ValueError) else "文档损坏、缺少章节或内容格式不受支持。"
        print(json.dumps({"error": message}, ensure_ascii=False))
        sys.exit(2)
