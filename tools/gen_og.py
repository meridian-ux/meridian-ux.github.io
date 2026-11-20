#!/usr/bin/env python3
"""Generate the default Meridian OG card and any opted-in feature cards.

Reads src/content/features.json (the collected catalog), renders an on-brand SVG per
feature (mark + eyebrow + wrapped headline + tagline), and rasterizes to
public/assets/og/<slug>.png via rsvg-convert with the vendored Space Grotesk fonts.

  python3 tools/gen_og.py            # (re)generate cards for og_generate features
"""
import base64
import html
from pathlib import Path
import json
import os
import shutil
import subprocess
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CATALOG = os.path.join(ROOT, "src", "content", "features.json")
FONTS = os.path.join(ROOT, "public", "assets", "fonts")
OUT = os.path.join(ROOT, "public", "assets", "og")

MARK_PATH = Path(ROOT) / "public" / "assets" / "meridian-mark-512.png"


def mark_svg():
    data = base64.b64encode(MARK_PATH.read_bytes()).decode("ascii")
    return f'<image x="76" y="68" width="60" height="60" href="data:image/png;base64,{data}"/>'


def wrap(text, width):
    """Greedy word-wrap by character budget."""
    words, lines, cur = text.split(), [], ""
    for w in words:
        if cur and len(cur) + 1 + len(w) > width:
            lines.append(cur)
            cur = w
        else:
            cur = f"{cur} {w}".strip()
    if cur:
        lines.append(cur)
    return lines


def svg_for(feat):
    hero = feat.get("hero", {})
    eyebrow = (hero.get("eyebrow") or feat.get("category", "").lower()).upper()
    headline = hero.get("headline") or feat.get("name")
    tagline = feat.get("tagline", "")
    hlines = wrap(headline, 22)[:3]
    tlines = wrap(tagline, 64)[:2]

    # Headline block, top-anchored around y=250.
    hy = 300
    htext = ""
    for i, ln in enumerate(hlines):
        htext += f'<text x="76" y="{hy + i*66}" font-family="Space Grotesk" font-weight="600" font-size="58" letter-spacing="-2" fill="#E9EAF3">{html.escape(ln)}</text>\n'
    ty = hy + len(hlines) * 66 + 26
    ttext = ""
    for i, ln in enumerate(tlines):
        ttext += f'<text x="76" y="{ty + i*30}" font-family="Space Grotesk" font-weight="500" font-size="22" fill="#8F91A6">{html.escape(ln)}</text>\n'

    return f'''<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#131419"/>
  <path d="M76 156H1124" stroke="#262A34"/>
  {mark_svg()}
  <text x="150" y="112" font-family="Space Grotesk" font-weight="600" font-size="34" letter-spacing="-0.3" fill="#E9EAF3">Meridian</text>
  <text x="76" y="232" font-family="monospace" font-size="18" letter-spacing="4" fill="#6E8BFF">{html.escape(eyebrow)}</text>
  {htext}
  {ttext}
  <text x="76" y="580" font-family="monospace" font-size="17" letter-spacing="0.5" fill="#8F91A6">meridian-ux.github.io</text>
</svg>'''


def main():
    catalog = json.load(open(CATALOG, encoding="utf-8"))
    default = {
        "slug": "default",
        "hero": {"headline": "A design language for interfaces."},
        "tagline": "Typed descriptors for the web, SwiftUI, and the terminal.",
    }
    feats = [default, *(f for f in catalog["features"] if f.get("meta", {}).get("og_generate"))]
    os.makedirs(OUT, exist_ok=True)

    # Stage fonts so fontconfig (rsvg) can resolve "Space Grotesk".
    home = tempfile.mkdtemp(prefix="og-fonts-")
    fdir = os.path.join(home, ".fonts")
    os.makedirs(fdir)
    for ttf in os.listdir(FONTS):
        if ttf.endswith(".ttf"):
            shutil.copy(os.path.join(FONTS, ttf), fdir)
    env = dict(os.environ, HOME=home)
    subprocess.run(["fc-cache", "-f", fdir], env=env, capture_output=True)

    for f in feats:
        svg_path = os.path.join(home, f"{f['slug']}.svg")
        png_path = os.path.join(OUT, f"{f['slug']}.png")
        open(svg_path, "w", encoding="utf-8").write(svg_for(f))
        subprocess.run(
            ["rsvg-convert", "-w", "1200", "-h", "630", svg_path, "-o", png_path],
            env=env, check=True,
        )
        print(f"  og/{f['slug']}.png")
    shutil.rmtree(home, ignore_errors=True)
    print(f"generated {len(feats)} OG cards")


if __name__ == "__main__":
    main()
