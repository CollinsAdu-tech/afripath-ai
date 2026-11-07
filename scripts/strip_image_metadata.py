"""Removes ALL embedded metadata (EXIF, XMP, ICC, PNG text chunks, content-credential/provenance data) from the
images in web/public/img by re-saving only the pixels. Run it before you publish photos:

    pip install pillow
    python scripts/strip_image_metadata.py            # cleans web/public/img in place
    python scripts/strip_image_metadata.py some/dir   # or another folder
"""

import sys
from pathlib import Path

from PIL import Image

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / "web" / "public" / "img"
count = 0
for f in sorted(root.rglob("*")):
    ext = f.suffix.lower()
    if ext not in (".jpg", ".jpeg", ".png", ".webp"):
        continue
    with Image.open(f) as im:
        im.load()
        if im.mode in ("P", "PA"):
            im = im.convert("RGBA")
        clean = Image.frombytes(im.mode, im.size, im.tobytes())
        fmt = {".jpg": "JPEG", ".jpeg": "JPEG", ".png": "PNG", ".webp": "WEBP"}[ext]
        kwargs = {"quality": 88, "optimize": True} if fmt in ("JPEG", "WEBP") else {"optimize": True}
        clean.save(f, fmt, **kwargs)  # no exif/xmp/icc/pnginfo passed, so none is written
    count += 1
    print("cleaned", f.relative_to(root))
print(f"{count} image(s) cleaned")
