from __future__ import annotations

import shutil
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DIST = ROOT / "dist"
ARCHIVE = ROOT / "双考航线-静态部署包.zip"

FILES = [
    "index.html",
    "404.html",
    "styles.css",
    "app.js",
    "listening-data.js",
    "manifest.webmanifest",
    "service-worker.js",
    "_headers",
    ".nojekyll",
]
DIRECTORIES = ["icons", "media"]


def ensure_inside_root(path: Path) -> None:
    resolved = path.resolve()
    if resolved != ROOT and ROOT not in resolved.parents:
        raise RuntimeError(f"Refusing to modify a path outside the project: {resolved}")


def main() -> None:
    ensure_inside_root(DIST)
    ensure_inside_root(ARCHIVE)

    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir(parents=True)

    for relative in FILES:
        source = ROOT / relative
        if not source.exists():
            raise FileNotFoundError(source)
        shutil.copy2(source, DIST / relative)

    for relative in DIRECTORIES:
        source = ROOT / relative
        shutil.copytree(source, DIST / relative)

    if ARCHIVE.exists():
        ARCHIVE.unlink()
    with zipfile.ZipFile(ARCHIVE, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in DIST.rglob("*"):
            if path.is_file():
                archive.write(path, path.relative_to(DIST))

    print(f"Built: {DIST}")
    print(f"Archive: {ARCHIVE}")


if __name__ == "__main__":
    main()
