"""Recognize four raster formats from leading bytes. Not a validator or a scanner.

The declared Content-Type, the URL suffix and the origin site's response headers
are all chosen by an untrusted page, so none of them is consulted: only the bytes
decide. This establishes *which* format the bytes are, and deliberately does not
attempt to prove the image is well-formed or safe to decode — the bytes are
stored and served back verbatim, never decoded by this process.
"""

from studypilot.modules.resources.contracts import ResourceError

PNG = b"\x89PNG\r\n\x1a\n"
GIF = (b"GIF87a", b"GIF89a")
JPEG = b"\xff\xd8\xff"


def recognize_image(data: bytes) -> str:
    """Return the media type, or refuse. SVG and every other format land here."""

    if data.startswith(PNG) and data[12:16] == b"IHDR":
        return "image/png"
    if data.startswith(JPEG):
        return "image/jpeg"
    if data.startswith(GIF) and len(data) >= 13:
        return "image/gif"
    # RIFF containers carry many payloads; the 8-byte offset says which one.
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP" and len(data) >= 16:
        return "image/webp"
    raise ResourceError("ASSET_TYPE_UNSUPPORTED", 415)
