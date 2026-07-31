from pathlib import Path
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
OUTPUT = Path(r"C:\Users\33502\Documents\Codex\Mimosa\deliverables\mimosa-cloud.zip")

index = (DIST / "index.html").read_text(encoding="utf-8")
asset_files = sorted((DIST / "assets").iterdir())
for asset in asset_files:
    index = index.replace(f"/assets/{asset.name}", f"./{asset.name}")
index = index.replace('href="/favicon.svg"', 'href="./favicon.svg"')

entries: dict[str, bytes] = {
    "index.html": index.encode("utf-8"),
    "favicon.svg": (DIST / "favicon.svg").read_bytes(),
    "icons.svg": (DIST / "icons.svg").read_bytes(),
}
for asset in asset_files:
    entries[asset.name] = asset.read_bytes()

invalid = re.compile(r'[\\/:*?"<>|]')
for name in entries:
    if invalid.search(name):
        raise ValueError(f"Illegal archive entry: {name!r}")

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(OUTPUT, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name, content in entries.items():
        info = zipfile.ZipInfo(name)
        info.create_system = 0
        info.external_attr = 0
        archive.writestr(info, content, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)

with zipfile.ZipFile(OUTPUT) as archive:
    names = archive.namelist()
    if any(invalid.search(name) for name in names):
        raise RuntimeError("Validation failed")
    if "index.html" not in names:
        raise RuntimeError("index.html missing")
    print(OUTPUT)
    for name in names:
        print(name)
