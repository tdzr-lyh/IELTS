"""Generate complete British-English phrase clips for the static website.

Run once after updating listening-data.js. Existing clips are reused; deployment
only copies the checked-in MP3 files and does not need a live speech service.
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
from pathlib import Path
import re
import time
import urllib.parse
import urllib.request


ROOT = Path(__file__).resolve().parent
AUDIO_DIR = ROOT / "media" / "phrases"
MANIFEST = ROOT / "phrase-audio.js"
TOKEN = re.compile(r"[A-Za-z]+(?:['’][A-Za-z]+)*|\d+(?:\.\d+)?")


def phrase_key(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip()).lower().replace("’", "'")


def library_phrases() -> list[str]:
    source = (ROOT / "listening-data.js").read_text(encoding="utf-8")
    library = json.loads(source.split(" = ", 1)[1].strip().removesuffix(";"))
    return sorted({
        phrase_key(entry["term"])
        for group in ("sceneCategories", "jijingCategories")
        for category in library[group]
        for entry in category["entries"]
        if len(TOKEN.findall(entry["term"])) > 1
    })


def clip_path(phrase: str) -> Path:
    digest = hashlib.sha256(phrase.encode("utf-8")).hexdigest()[:20]
    return AUDIO_DIR / f"{digest}.mp3"


def valid_clip(path: Path) -> bool:
    if not path.is_file() or path.stat().st_size < 512:
        return False
    header = path.read_bytes()[:3]
    return header == b"ID3" or (header[0] == 0xFF and header[1] & 0xE0 == 0xE0)


def generate_clip(phrase: str) -> None:
    target = clip_path(phrase)
    if valid_clip(target):
        return
    query = urllib.parse.urlencode({
        "ie": "UTF-8", "client": "tw-ob", "tl": "en-GB", "q": phrase,
    })
    request = urllib.request.Request(
        f"https://translate.google.co.uk/translate_tts?{query}",
        headers={"User-Agent": "Mozilla/5.0"},
    )
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=25) as response:
                data = response.read()
                if response.headers.get_content_type() != "audio/mpeg":
                    raise ValueError("Speech service did not return MP3 audio")
            temporary = target.with_suffix(".tmp")
            temporary.write_bytes(data)
            if not valid_clip(temporary):
                raise ValueError("Speech service returned invalid or empty audio")
            temporary.replace(target)
            return
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)


def verify_phrase_audio() -> int:
    phrases = library_phrases()
    missing = [phrase for phrase in phrases if not valid_clip(clip_path(phrase))]
    if missing:
        raise ValueError(f"Missing or invalid phrase audio ({len(missing)}): {missing[:5]}")
    source = MANIFEST.read_text(encoding="utf-8")
    manifest = json.loads(source.split(" = ", 1)[1].strip().removesuffix(";"))
    expected = {phrase: f"./media/phrases/{clip_path(phrase).name}" for phrase in phrases}
    if manifest.get("locale") != "en-GB" or manifest.get("clips") != expected:
        raise ValueError("Phrase manifest does not match the current library; regenerate it")
    return len(phrases)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify coverage without network access")
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()
    phrases = library_phrases()

    if args.check:
        print(f"Verified {verify_phrase_audio()} complete en-GB phrase clips", flush=True)
        return

    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    failures = []
    with ThreadPoolExecutor(max_workers=max(1, min(args.workers, 8))) as executor:
        futures = {executor.submit(generate_clip, phrase): phrase for phrase in phrases}
        for completed, future in enumerate(as_completed(futures), 1):
            phrase = futures[future]
            try:
                future.result()
            except Exception as error:
                failures.append(phrase)
                print(f"Failed {phrase!r}: {type(error).__name__}: {error}", flush=True)
            if completed % 50 == 0 or completed == len(phrases):
                print(f"Phrase audio: {completed}/{len(phrases)}, failed: {len(failures)}", flush=True)
    if failures:
        raise SystemExit(f"Could not generate {len(failures)} clips; rerun to retry missing audio")

    manifest = {
        "version": 1,
        "locale": "en-GB",
        "clips": {phrase: f"./media/phrases/{clip_path(phrase).name}" for phrase in phrases},
    }
    MANIFEST.write_text(
        "// Complete British-English phrase recordings. Regenerate with build_phrase_audio.py.\n"
        f"window.PHRASE_AUDIO = {json.dumps(manifest, ensure_ascii=False, separators=(',', ':'))};\n",
        encoding="utf-8",
    )
    print(f"Published manifest for {len(phrases)} clips", flush=True)


if __name__ == "__main__":
    main()
