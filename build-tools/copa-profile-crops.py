"""Generate Copa profile silhouettes from a Showdown PNG tree plus bundled Z-A sprites.

Usage: python3 build-tools/copa-profile-crops.py /path/to/play.pokemonshowdown.com/sprites
Source: MasterTernimus/PokemonShowdown-Client at baf485faff4d224134bd1ead47936e02c25b2be8.
Requires Pillow. The JSON is shipped with the client, so image hosts need no CORS.
"""
import json
from pathlib import Path
import sys

from PIL import Image, UnidentifiedImageError

root = Path(sys.argv[1])
assets = Path(__file__).resolve().parents[1] / "play.pokemonshowdown.com/assets/copa-rinha"
crops = {}
for directory in ("trainers", "trainers-custom", "gen5", "gen5-shiny", "partner-za", "profile-partners", "copa-avatars"):
    files = (assets if directory in ("partner-za", "profile-partners") else root) / directory
    if directory == "copa-avatars":
        files = assets / "avatars"
    for path in sorted(files.glob("*.png")):
        try:
            image = Image.open(path)
        except UnidentifiedImageError:
            continue
        with image:
            alpha = image.convert("RGBA").getchannel("A")
            width, height = alpha.size
            bounds = alpha.getbbox()
            if not bounds:
                continue
            left, top, right, bottom = bounds
            rows = []
            for y in range(top, bottom):
                row = alpha.crop((left, y, right, y + 1)).getbbox()
                if row:
                    rows.append((y, row[0] + left, row[2] + left))
            crops[f"{directory}/{path.name}"] = [width, height, left, right, top, bottom, rows]
(assets / "profile-crops.json").write_text(json.dumps(crops, separators=(",", ":")) + "\n")
