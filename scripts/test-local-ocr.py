#!/usr/bin/env python3
"""Developer-only synthetic media oracle. No ffmpeg is shipped or used by the app."""
import argparse
import hashlib
import os
from pathlib import Path
import shutil
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument("--scratch", required=True, type=Path)
args = parser.parse_args()
root = args.scratch.resolve() / "scanner-ocr-generated"
root.mkdir(mode=0o700, parents=True, exist_ok=False)
ffmpeg = shutil.which("ffmpeg")
assert ffmpeg, "Developer fixture generation requires ffmpeg"
font = "/System/Library/Fonts/Supplemental/Arial.ttf"
name = "20261021120000_000001.MP4"
for case, stamps in {
    "positive": ["VIOFO A119M Pro"], "blank": [], "mini": ["VIOFO A119 Mini 2"],
    "conflicting": ["VIOFO A119M Pro", "VIOFO A119 Mini 2"],
    "mixed": ["VIOFO A119M Pro"], "top-only": ["VIOFO A119M Pro"],
    "large-tail": ["VIOFO A119M Pro"],
}.items():
    folder = root / case / "DCIM/Movie"
    folder.mkdir(parents=True)
    filters = []
    for i, stamp in enumerate(stamps):
        y = "80" if case == "top-only" else f"h-{100 + i * 90}"
        filters.append(f"drawtext=fontfile={font}:text='{stamp}':fontcolor=white:fontsize=56:x=(w-tw)/2:y={y}")
    subprocess.run([ffmpeg, "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
                    "color=c=black:s=1920x1080:d=2", "-vf", ",".join(filters) or "null",
                    "-c:v", "libx264", str(folder / name)], check=True)
# Keep chunk offsets unchanged; insert a large sparse free box before tail moov.
# This verifies bounded random access, not an accidentally whole-file decoder.
large = root / "large-tail/DCIM/Movie" / name
original = large.read_bytes()
offset = 0
while original[offset + 4:offset + 8] != b"moov":
    offset += int.from_bytes(original[offset:offset + 4], "big")
padding = 128 * 1024 * 1024
with large.open("wb") as file:
    file.write(original[:offset])
    file.write(padding.to_bytes(4, "big") + b"free")
    file.seek(padding - 8, 1)
    file.write(original[offset:])
shutil.copy2(root / "mini/DCIM/Movie" / name, root / "mixed/DCIM/Movie/20261021120100_000002.MP4")
(root / "fifo/DCIM/Movie").mkdir(parents=True)
os.mkfifo(root / "fifo/DCIM/Movie" / name)
for case in ["symlink-file", "symlink-dir"]:
    (root / case / "DCIM").mkdir(parents=True)
(root / "symlink-dir/DCIM/Movie").symlink_to(root / "positive/DCIM/Movie", target_is_directory=True)
(root / "symlink-file/DCIM/Movie").mkdir()
(root / "symlink-file/DCIM/Movie" / name).symlink_to(root / "positive/DCIM/Movie" / name)

def inventory():
    return {str(p.relative_to(root)): (hashlib.sha256(p.read_bytes()).hexdigest(), p.stat().st_mtime_ns)
            for p in root.rglob("*.MP4") if p.is_file() and not p.is_symlink()}

before = inventory()
env = dict(os.environ, SCANNER_OCR_FIXTURES=str(root), TMPDIR=str(args.scratch.resolve()))
env.pop("SCANNER_DISABLE_NATIVE_OCR", None)
result = subprocess.run(["cargo", "test", "--locked", "--manifest-path", "src-tauri/Cargo.toml",
                "actual_native_decoder_and_vision", "--", "--ignored", "--nocapture"], env=env,
                text=True, capture_output=True)
print(result.stdout, end="")
print(result.stderr, end="")
result.check_returncode()
assert "actual_native_decoder_and_vision ... ok" in result.stdout, "Native OCR test was not collected"
assert before == inventory(), "Source contents or mtimes changed"
print(f"PASS: actual decoder/OCR; {len(before)} synthetic source hashes and mtimes unchanged")
print(f"Private synthetic fixtures retained at {root}")
