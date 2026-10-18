"""Generate the French listening audio: data/french_audio.js + audio/fr/*.mp3.

Usage:
  pip install piper-tts lameenc
  python3 tools/build_audio.py <voices-dir> [--jobs 4] [--cache DIR]

With --cache, every clip is also stored under DIR by a hash of its voice,
speed and text, and reused next time: after editing a few sentences only
those clips are synthesised again.

<voices-dir> must hold the Piper voices fr_FR-siwis-medium.onnx(.json) and
en_GB-alba-medium.onnx(.json) from https://huggingface.co/rhasspy/piper-voices
(both CC BY 4.0). Run tools/build_sentences.js first so the sentences exist.

Every vocabulary word gets three clips: the French word (w), its English
meaning (e) and its example sentence (s). Clips are MP3 frames from separate
encoder runs, all mono 22,050 Hz at a constant 32 kbit/s, so any clips can be
joined end to end into one valid MP3 track. That is what the app's Listen page
does: it builds one track from the words a student knows, which keeps playing
with the screen locked, unlike speech synthesis.

Clips are packed into one file per vocabulary sub-topic (41 files rather than
6,400, which keeps a website or artifact upload manageable); the index records
each clip's byte offset, length and duration.
"""
import hashlib
import json
import os
import subprocess
import sys
from concurrent.futures import ProcessPoolExecutor

RATE = 22050
KBPS = 32
SAMPLES_PER_FRAME = 576            # MPEG-2 layer III
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT_DIR = os.path.join(ROOT, "audio", "fr")
FR_VOICE = "fr_FR-siwis-medium"
EN_VOICE = "en_GB-alba-medium"
FR_SPEED = 1.12                    # a touch slower than native for learners
EN_SPEED = 1.0

_voices = {}


def _voice(voices_dir, name):
    if name not in _voices:
        from piper import PiperVoice
        _voices[name] = PiperVoice.load(os.path.join(voices_dir, name + ".onnx"))
    return _voices[name]


def frames(mp3):
    """Split an MP3 byte string into frames; refuses anything unexpected."""
    out, i = [], 0
    rates = {(2, 32): None}
    while i < len(mp3):
        h = mp3[i:i + 4]
        if len(h) < 4 or h[0] != 0xFF or (h[1] & 0xE0) != 0xE0:
            raise ValueError("lost frame sync at byte %d" % i)
        version = (h[1] >> 3) & 3          # 2 = MPEG-2
        layer = (h[1] >> 1) & 3            # 1 = layer III
        br_idx = h[2] >> 4
        sr_idx = (h[2] >> 2) & 3
        pad = (h[2] >> 1) & 1
        if version != 2 or layer != 1 or sr_idx != 0 or br_idx != 4:  # MPEG-2, L3, 22050 Hz, 32 kbps
            raise ValueError("unexpected frame header %s at byte %d" % (h.hex(), i))
        size = 72 * KBPS * 1000 // RATE + pad
        out.append(mp3[i:i + size])
        i += size
    return out


def encode(pcm):
    import lameenc
    enc = lameenc.Encoder()
    enc.set_bit_rate(KBPS)
    enc.set_in_sample_rate(RATE)
    enc.set_channels(1)
    enc.set_quality(2)
    data = bytes(enc.encode(pcm) + enc.flush())
    fr = frames(data)                       # also validates the stream
    return b"".join(fr), len(fr)


def synth(voices_dir, name, text, speed):
    from piper.config import SynthesisConfig
    v = _voice(voices_dir, name)
    pcm = b"".join(c.audio_int16_bytes for c in v.synthesize(text, SynthesisConfig(length_scale=speed)))
    if v.config.sample_rate != RATE:
        raise ValueError("%s is %d Hz, expected %d" % (name, v.config.sample_rate, RATE))
    return pcm


def cache_path(cache, voice, speed, text):
    h = hashlib.sha1(("%s|%s|%s" % (voice, speed, text)).encode("utf-8")).hexdigest()
    return os.path.join(cache, h[:2], h + ".mp3")


def clip(voices_dir, cache, voice, speed, text):
    path = cache_path(cache, voice, speed, text) if cache else None
    if path and os.path.exists(path):
        with open(path, "rb") as fh:
            mp3 = fh.read()
        return mp3, len(frames(mp3)), False
    mp3, n = encode(synth(voices_dir, voice, text, speed))
    if path:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as fh:
            fh.write(mp3)
    return mp3, n, True


def build_bank(args):
    voices_dir, cache, bank, entries = args
    blob, index, made = bytearray(), {}, 0
    for e in entries:
        clips = {}
        for kind, voice, speed in (("w", FR_VOICE, FR_SPEED), ("e", EN_VOICE, EN_SPEED), ("s", FR_VOICE, FR_SPEED)):
            text = e[kind]
            if not text:
                continue
            mp3, n, fresh = clip(voices_dir, cache, voice, speed, text)
            made += fresh
            clips[kind] = [len(blob), len(mp3), round(n * SAMPLES_PER_FRAME / RATE, 3)]
            blob += mp3
        index[e["key"]] = clips
    path = os.path.join(OUT_DIR, bank + ".mp3")
    with open(path, "wb") as fh:
        fh.write(blob)
    return bank, len(blob), index, made


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    voices_dir = sys.argv[1]
    jobs = int(sys.argv[sys.argv.index("--jobs") + 1]) if "--jobs" in sys.argv else os.cpu_count() or 2
    cache = sys.argv[sys.argv.index("--cache") + 1] if "--cache" in sys.argv else None
    manifest = json.loads(subprocess.check_output(["node", os.path.join(ROOT, "tools", "audio_manifest.js")]))
    missing = [m["key"] for m in manifest if not m["s"]]
    if missing:
        sys.exit("%d words have no example sentence (first: %r); run tools/build_sentences.js" % (len(missing), missing[0]))
    os.makedirs(OUT_DIR, exist_ok=True)
    banks = {}
    for m in manifest:
        banks.setdefault(m["bank"], []).append(m)

    # Half a second of silence, repeated by the app to make gaps.
    silence, n = encode(b"\0\0" * (RATE // 2))
    with open(os.path.join(OUT_DIR, "silence.mp3"), "wb") as fh:
        fh.write(silence)

    index, sizes, made = {}, {}, 0
    with ProcessPoolExecutor(max_workers=jobs) as pool:
        for bank, size, clips, fresh in pool.map(build_bank, [(voices_dir, cache, b, es) for b, es in banks.items()]):
            sizes[bank] = size
            made += fresh
            for key, c in clips.items():
                index[key] = dict(c, b=bank)
            print("  %-4s %4d words  %6.1f KB  %3d new clips" % (bank, len(clips), size / 1024, fresh), flush=True)

    payload = {
        "format": {"rate": RATE, "kbps": KBPS, "samplesPerFrame": SAMPLES_PER_FRAME},
        "credits": "Voices: Piper 'siwis' (French) and 'alba' (British English), CC BY 4.0 — "
                   "SIWIS French Speech Synthesis Database and University of Edinburgh datashare.",
        "silence": {"file": "audio/fr/silence.mp3", "dur": round(n * SAMPLES_PER_FRAME / RATE, 3)},
        "banks": {b: {"file": "audio/fr/%s.mp3" % b, "bytes": sizes[b]} for b in sorted(sizes)},
        "clips": index,
    }
    with open(os.path.join(ROOT, "data", "french_audio.js"), "w", encoding="utf-8") as fh:
        fh.write("// Generated by tools/build_audio.py. Do not edit by hand.\n")
        fh.write("window.IGCSE_DATA = window.IGCSE_DATA || {};\n")
        fh.write("window.IGCSE_DATA.frenchAudio = ")
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write(";\n")
    total = sum(sizes.values())
    print("audio      %d words  %d banks  %.1f MB  %d clips synthesised  -> audio/fr/, data/french_audio.js"
          % (len(index), len(sizes), total / 1048576, made))


if __name__ == "__main__":
    main()
