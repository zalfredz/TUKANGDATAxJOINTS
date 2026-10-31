"""Assemble index.html: template + fonts + data + JS into one file that runs offline.

Run: python build/build_html.py   (after build/build_data.py when the data changed)
"""
from __future__ import annotations

import base64
import json
import logging
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JS_ORDER = ("engine", "store", "ui")
# family, CSS weight (range for a variable font), file in assets/fonts
FONT_FACES = (
    ("Plus Jakarta Sans", "400 800", "plus-jakarta-sans-var-latin.woff2"),
    ("JetBrains Mono", "500 800", "jetbrains-mono-var-latin.woff2"),
)
WOFF2_MAGIC = b"wOF2"
FORBIDDEN_TEXT = ("console.log", "claude", "anthropic", "jutaan tabel", "kota tujuan mudik", "kamis pagi", "belum tentu bertahan", "submisi")
SCRIPT_BREAKERS = ("</script", "<script", "<!--")
# Characters that could end or confuse the script element the data sits in, as JSON escapes.
JSON_SCRIPT_ESCAPES = {ord(c): f"\\u{ord(c):04x}" for c in "<>&  "}

log = logging.getLogger("build_html")


def read_text(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


def font_css() -> str:
    """@font-face rules with the fonts inlined, so the page needs no network at the venue."""
    rules = []
    for family, weight, name in FONT_FACES:
        raw = (ROOT / "assets" / "fonts" / name).read_bytes()
        if not raw.startswith(WOFF2_MAGIC):
            raise ValueError(f"{name} is not a WOFF2 file")
        encoded = base64.b64encode(raw).decode("ascii")
        rules.append(
            f'@font-face{{font-family:"{family}";font-weight:{weight};font-style:normal;font-display:swap;'
            f'src:url(data:font/woff2;base64,{encoded}) format("woff2");}}'
        )
    return "\n".join(rules)


def data_json() -> str:
    """Compact JSON that cannot close or confuse the script tag it is embedded in."""
    data = json.loads(read_text("data/data.json"))
    return json.dumps(data, ensure_ascii=False, separators=(",", ":")).translate(JSON_SCRIPT_ESCAPES)


def check_output(js: str, data: str, template: str) -> None:
    """Fail the build instead of shipping a page that breaks a rule of the deck kit."""
    breakers = [word for word in SCRIPT_BREAKERS if word in js.lower()]
    if breakers:
        raise ValueError(f"JS contains text that breaks its script tag: {breakers}")
    text = "\n".join((js, data, template)).lower()
    hits = [word for word in FORBIDDEN_TEXT if word in text]
    if hits:
        raise ValueError(f"Forbidden text in output: {hits}")


def build() -> Path:
    template = read_text("src/template.html")
    js = "\n".join(read_text(f"src/{name}.js") for name in JS_ORDER)
    data = data_json()
    check_output(js, data, template)
    parts = {"FONTS": font_css(), "DATA": data, "JS": js}
    # Single pass, so marker-like text inside the inserted parts is never replaced again.
    html = re.sub(r"__(FONTS|DATA|JS)__", lambda m: parts[m.group(1)], template)
    out = ROOT / "index.html"
    out.write_text(html, encoding="utf-8", newline="\n")
    log.info("wrote %s (%.2f MB)", out, out.stat().st_size / 1e6)
    return out


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    build()
