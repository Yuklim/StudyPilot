"""Tiny synthetic containers, built in memory; no real document fixtures."""

import io
import struct
import zipfile

from pypdf import PdfWriter


def pdf() -> bytes:
    stream = io.BytesIO()
    writer = PdfWriter()
    writer.add_blank_page(width=72, height=72)
    writer.write(stream)
    return stream.getvalue()


def docx(extra: dict[str, bytes] | None = None) -> bytes:
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            "[Content_Types].xml",
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats'
            '-officedocument.wordprocessingml.document.main+xml"/></Types>',
        )
        archive.writestr(
            "word/document.xml",
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            "<w:body><w:p/></w:body></w:document>",
        )
        for name, value in (extra or {}).items():
            archive.writestr(name, value)
    return stream.getvalue()


def doc() -> bytes:
    free, end, fat = 0xFFFFFFFF, 0xFFFFFFFE, 0xFFFFFFFD
    header = bytearray(512)
    header[:8] = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
    struct.pack_into("<HHHHH", header, 24, 0x3E, 3, 0xFFFE, 9, 6)
    struct.pack_into("<IIIIIIIII", header, 40, 0, 1, 9, 0, 4096, end, 0, end, 0)
    struct.pack_into("<109I", header, 76, 8, *([free] * 108))
    directory = bytearray(512)
    for index, name, kind, child, first, size in (
        (0, "Root Entry", 5, 1, end, 0),
        (1, "WordDocument", 2, free, 0, 4096),
    ):
        offset = index * 128
        encoded = (name + "\0").encode("utf-16le")
        directory[offset : offset + len(encoded)] = encoded
        struct.pack_into(
            "<HBBIII", directory, offset + 64, len(encoded), kind, 1, free, free, child
        )
        struct.pack_into("<IQ", directory, offset + 116, first, size)
    table = struct.pack("<128I", *range(1, 8), end, fat, end, *([free] * 118))
    return bytes(header) + b"\xec\xa5" + bytes(4094) + table + bytes(directory)
