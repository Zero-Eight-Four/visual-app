"""Regenerate application WOFF2 fonts: python -m pip install fonttools brotli."""

from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont


ROOT = Path(__file__).resolve().parents[1]
FONT_DIR = ROOT / "src/assets/fonts"
TEXT_EXTENSIONS = {".vue", ".ts", ".js", ".json", ".css", ".html", ".svg"}


def main():
    # Include ASCII and project text; other characters use the CSS fallback fonts.
    characters = set(map(chr, range(32, 127)))
    characters.update((ROOT / "index.html").read_text(encoding="utf-8"))
    for directory in ("src", "server", "config", "public"):
        for path in sorted((ROOT / directory).rglob("*")):
            if path.is_file() and path.suffix in TEXT_EXTENSIONS:
                characters.update(path.read_text(encoding="utf-8"))

    for weight in ("regular", "bold"):
        source = FONT_DIR / f"source-han-sans-sc-{weight}.otf"
        target = FONT_DIR / f"source-han-sans-sc-{weight}-subset.woff2"
        with TTFont(source) as font:
            required = set(map(ord, characters)) & set(font.getBestCmap())
            options = subset.Options()
            options.hinting = False
            # The UI uses horizontal Simplified Chinese text; omit vertical and
            # alternate regional glyphs while retaining kerning and ligatures.
            options.layout_features = ["kern", "liga"]
            subsetter = subset.Subsetter(options=options)
            subsetter.populate(unicodes=required)
            subsetter.subset(font)
            font.flavor = "woff2"
            font.save(target)

        with TTFont(target) as result:
            assert required <= set(result.getBestCmap()), "Missing project characters"
        print(f"{target.name}: {target.stat().st_size:,} bytes, {len(required)} characters")


if __name__ == "__main__":
    main()
