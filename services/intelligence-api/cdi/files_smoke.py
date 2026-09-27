"""Company Files OCR smoke test for the deployed image (ADR-018): `python -m cdi.files_smoke`.

Renders a synthetic scanned page (an image-only PDF, no text layer), runs the shared extractor with Docling OCR and
table structure, and prints what came back. Uses no network, no database and no ERP. Exit code 0 only when the
OCR text contains the rendered words."""

import io
import sys

WORDS = ["BERITA", "ACARA", "SERAH", "TERIMA", "SYNTHETIC"]


def scanned_pdf():
    from PIL import Image, ImageDraw, ImageFont

    page = Image.new("RGB", (1240, 1754), "white")
    draw = ImageDraw.Draw(page)
    font = ImageFont.load_default(size=56)
    for i, line in enumerate(["BERITA ACARA SERAH TERIMA", "PT SYNTHETIC INDONESIA", "Periode Maret 2026"]):
        draw.text((120, 200 + i * 110), line, fill="black", font=font)
    out = io.BytesIO()
    page.save(out, "PDF", resolution=150)
    return out.getvalue()


def main():
    from . import extract

    if not extract.docling_available():
        print("Docling is not installed in this environment; OCR is unavailable.")
        return 2
    got = extract.extract("smoke-scan.pdf", scanned_pdf())
    text = got.text.upper()
    found = [w for w in WORDS if w in text]
    print(f"parser={got.parser} pages={len(got.pages)} ocr_pages={got.ocr_pages} found={found}")
    return 0 if len(found) >= 4 else 1


if __name__ == "__main__":
    sys.exit(main())
