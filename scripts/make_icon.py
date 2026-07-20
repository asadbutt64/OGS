"""
Generate build/icon.ico for OmniGene Studio.
Produces a multi-size ICO (16, 32, 48, 64, 128, 256 px) from pure Python
using only the standard library — no Pillow required.

The icon matches the OGS badge:
  - Dark background  #0d1f1a
  - Green "OGS" text #3ddc84

Run from the repo root:
    python scripts/make_icon.py
"""
import struct, zlib, math, os, sys

def _png_bytes(size: int) -> bytes:
    """Return a minimal PNG of `size x size` pixels for the OGS icon."""
    # --- colours ---
    bg   = (0x0d, 0x1f, 0x1a, 0xff)   # dark green-black
    fg   = (0x3d, 0xdc, 0x84, 0xff)   # bright green
    white = (0xf1, 0xf5, 0xf9, 0xff)

    pixels = [list(bg) for _ in range(size * size)]

    def set_pixel(x, y, color):
        if 0 <= x < size and 0 <= y < size:
            pixels[y * size + x] = list(color)

    # --- rounded rectangle mask (corner radius = size//8) ---
    r = max(1, size // 8)
    cx, cy = size / 2 - 0.5, size / 2 - 0.5
    margin = size * 0.06

    # Fill a rounded rect by marking pixels outside the border as transparent-ish
    for y in range(size):
        for x in range(size):
            # corners
            def in_corner(px, py):
                dx = max(0, r - px) if px < r else max(0, px - (size - 1 - r))
                dy = max(0, r - py) if py < r else max(0, py - (size - 1 - r))
                return dx * dx + dy * dy > r * r
            if in_corner(x, y):
                pixels[y * size + x] = [0, 0, 0, 0]   # transparent

    # --- very simple bitmap font: each letter is a list of (row, col) relative offsets ---
    # We define a tiny 5x7 pixel font for O, G, S
    GLYPHS = {
        'O': [
          "01110",
          "10001",
          "10001",
          "10001",
          "10001",
          "10001",
          "01110",
        ],
        'G': [
          "01110",
          "10001",
          "10000",
          "10111",
          "10001",
          "10001",
          "01110",
        ],
        'S': [
          "01111",
          "10000",
          "10000",
          "01110",
          "00001",
          "00001",
          "11110",
        ],
    }

    scale = max(1, size // 20)
    glyph_w = 5 * scale
    glyph_h = 7 * scale
    spacing = max(1, scale)
    total_w = 3 * glyph_w + 2 * spacing
    x0 = (size - total_w) // 2
    y0 = (size - glyph_h) // 2

    for gi, ch in enumerate("OGS"):
        gx = x0 + gi * (glyph_w + spacing)
        for row_i, row in enumerate(GLYPHS[ch]):
            for col_i, bit in enumerate(row):
                if bit == '1':
                    for sy in range(scale):
                        for sx in range(scale):
                            set_pixel(gx + col_i * scale + sx,
                                      y0 + row_i * scale + sy,
                                      fg)

    # --- encode as PNG ---
    def make_chunk(name: bytes, data: bytes) -> bytes:
        length = struct.pack(">I", len(data))
        crc    = struct.pack(">I", zlib.crc32(name + data) & 0xFFFFFFFF)
        return length + name + data + crc

    # IHDR
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)

    # IDAT — raw image data (filter byte 0 per scanline)
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter type None
        for x in range(size):
            p = pixels[y * size + x]
            raw += bytes(p[:3])  # RGB (IHDR color type 2)

    compressed = zlib.compress(bytes(raw), 9)

    png = (
        b'\x89PNG\r\n\x1a\n'
        + make_chunk(b'IHDR', ihdr)
        + make_chunk(b'IDAT', compressed)
        + make_chunk(b'IEND', b'')
    )
    return png


def make_ico(path: str):
    sizes = [16, 32, 48, 64, 128, 256]
    images = [_png_bytes(s) for s in sizes]

    # ICO header
    count  = len(sizes)
    header = struct.pack("<HHH", 0, 1, count)   # reserved=0, type=1(ICO), count

    # Directory entries — each 16 bytes
    offset = 6 + count * 16
    directory = b""
    for i, (s, img) in enumerate(zip(sizes, images)):
        w = 0 if s == 256 else s   # 256 is encoded as 0 in ICO spec
        h = w
        directory += struct.pack("<BBBBHHII",
            w,          # width
            h,          # height
            0,          # colour count (0 = no palette)
            0,          # reserved
            1,          # colour planes
            32,         # bits per pixel
            len(img),   # size of image data
            offset,     # offset of image data
        )
        offset += len(img)

    with open(path, "wb") as f:
        f.write(header + directory + b"".join(images))

    print(f"Generated {path}  ({os.path.getsize(path):,} bytes)")


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(__file__), "..", "build", "icon.ico")
    out = os.path.normpath(out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    make_ico(out)
