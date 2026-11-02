"""Package every vocabulary pronunciation into small, reusable British audio packs.

One pack covers up to 24 neighbouring vocabulary items, avoiding a separate
network handshake on every tap. Full phrase MP3s are reused without splitting.
Individual generated word files are build intermediates, not deployment assets.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
from pathlib import Path

import build_phrase_audio as phrases

ROOT = Path(__file__).resolve().parent
WORDS = ROOT / "tmp" / "word-clips"
PACKS = ROOT / "media" / "pronunciation"
MANIFEST = ROOT / "pronunciation-audio.js"
PACK_SIZE = 24


def terms() -> list[str]:
    library = json.loads((ROOT / "listening-data.js").read_text(encoding="utf-8").split(" = ", 1)[1].strip().removesuffix(";"))
    return list(dict.fromkeys(
        phrases.phrase_key(entry["term"])
        for group in ("sceneCategories", "jijingCategories")
        for category in library[group] for entry in category["entries"]
    ))


def word_path(term: str) -> Path:
    return WORDS / f"{hashlib.sha256(term.encode('utf-8')).hexdigest()[:20]}.mp3"


def source_clip(term: str) -> Path:
    return phrases.clip_path(term) if len(phrases.TOKEN.findall(term)) > 1 else word_path(term)


def build_word(term: str) -> None:
    # Reuse the exact same complete en-GB synthesis, retries, and MP3 validation.
    target = word_path(term)
    if phrases.valid_clip(target):
        return
    import time
    import urllib.parse
    import urllib.request
    query = urllib.parse.urlencode({"ie": "UTF-8", "client": "tw-ob", "tl": "en-GB", "q": term})
    req = urllib.request.Request("https://translate.google.co.uk/translate_tts?" + query,
                                 headers={"User-Agent": "Mozilla/5.0"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=20) as response:
                if response.headers.get_content_type() != "audio/mpeg":
                    raise ValueError("Not an MP3 response")
                data = response.read()
            temp = target.with_suffix(".tmp")
            temp.write_bytes(data)
            if not phrases.valid_clip(temp):
                raise ValueError("Invalid MP3 data")
            temp.replace(target)
            return
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)


def verify_pronunciation_audio() -> int:
    data = json.loads(MANIFEST.read_text(encoding="utf-8").split(" = ", 1)[1].strip().removesuffix(";"))
    if data.get("locale") != "en-GB" or set(data["clips"]) != set(terms()):
        raise ValueError("Pronunciation coverage/locale does not match the library")
    binaries = {}
    for name, pack in data["packs"].items():
        path = ROOT / pack["url"].removeprefix("./")
        if PACKS not in path.resolve().parents:
            raise ValueError("Audio pack outside output directory")
        binary = path.read_bytes()
        if len(binary) != pack["bytes"] or hashlib.sha256(binary).hexdigest() != pack["sha256"]:
            raise ValueError(f"Invalid audio pack {name}")
        binaries[name] = binary
    for term, entry in data["clips"].items():
        binary = binaries[entry["pack"]]
        start, length = entry["offset"], entry["bytes"]
        clip = binary[start:start + length]
        if start < 0 or length < 512 or len(clip) != length or not (clip[:3] == b"ID3" or (clip[0] == 0xff and clip[1] & 0xe0 == 0xe0)):
            raise ValueError(f"Invalid audio slice for {term}")
    return len(data["clips"])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--workers", type=int, default=6)
    args = parser.parse_args()
    if args.check:
        print(f"Verified {verify_pronunciation_audio()} British vocabulary pronunciations", flush=True)
        return
    WORDS.mkdir(parents=True, exist_ok=True)
    words = [term for term in terms() if len(phrases.TOKEN.findall(term)) <= 1]
    failures = []
    with ThreadPoolExecutor(max_workers=min(8, max(1, args.workers))) as executor:
        futures = {executor.submit(build_word, word): word for word in words}
        for completed, future in enumerate(as_completed(futures), 1):
            try:
                future.result()
            except Exception as error:
                failures.append(futures[future])
                print(f"Failed {futures[future]!r}: {error}", flush=True)
            if completed % 100 == 0 or completed == len(words):
                print(f"Words: {completed}/{len(words)}, failed: {len(failures)}", flush=True)
    if failures:
        raise SystemExit(f"Missing {len(failures)} words; rerun to retry")
    PACKS.mkdir(parents=True, exist_ok=True)
    all_terms = terms()
    clips, packs = {}, {}
    for index in range(0, len(all_terms), PACK_SIZE):
        group = all_terms[index:index + PACK_SIZE]
        audio = bytearray()
        pack_id = f"p{index // PACK_SIZE:03d}"
        for term in group:
            data = source_clip(term).read_bytes()
            clips[term] = {"pack": pack_id, "offset": len(audio), "bytes": len(data)}
            audio.extend(data)
        sha = hashlib.sha256(audio).hexdigest()
        filename = f"{pack_id}-{sha[:12]}.bin"
        (PACKS / filename).write_bytes(audio)
        packs[pack_id] = {"url": f"./media/pronunciation/{filename}", "bytes": len(audio), "sha256": sha}
    manifest = {"version": 1, "locale": "en-GB", "clips": clips, "packs": packs}
    MANIFEST.write_text("// Complete British vocabulary clips packaged for preloading.\n"
                        f"window.PRONUNCIATION_AUDIO = {json.dumps(manifest, ensure_ascii=False, separators=(',', ':'))};\n", encoding="utf-8")
    print(f"Published {len(clips)} clips in {len(packs)} packs; {sum(p['bytes'] for p in packs.values()):,} bytes", flush=True)
    verify_pronunciation_audio()


if __name__ == "__main__":
    main()
