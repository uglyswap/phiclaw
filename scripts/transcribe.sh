#!/usr/bin/env bash
# transcribe.sh — Convert audio to text using faster-whisper (local Whisper).
# Usage: transcribe.sh <audio_file>
# Output: transcribed text on stdout (one segment per line).
set -euo pipefail

if [ $# -lt 1 ] || [ ! -f "$1" ]; then
  echo "Usage: transcribe.sh <audio_file>" >&2
  exit 1
fi

INPUT_FILE="$1"
MODEL_SIZE="${WHISPER_MODEL_SIZE:-small}"
CACHE_DIR="${HF_HOME:-$HOME/.cache/huggingface}"
TMP_WAV="$(mktemp /tmp/transcribe_XXXXXX.wav)"

cleanup() { rm -f "$TMP_WAV"; }
trap cleanup EXIT

# ── Convert to 16kHz mono WAV (Whisper's expected format) ───────
ffmpeg -hide_banner -loglevel error -y -i "$INPUT_FILE" \
  -ar 16000 -ac 1 -c:a pcm_s16le "$TMP_WAV"

# ── Transcribe with faster-whisper ──────────────────────────────
python3 - "$TMP_WAV" "$MODEL_SIZE" "$CACHE_DIR" <<'PYEOF'
import sys
from faster_whisper import WhisperModel

wav_path   = sys.argv[1]
model_size = sys.argv[2]
cache_dir  = sys.argv[3]

model = WhisperModel(model_size, device="cpu", compute_type="int8",
                     download_root=cache_dir)

segments, info = model.transcribe(wav_path, beam_size=5,
                                  vad_filter=True,
                                  vad_parameters=dict(min_silence_duration_ms=500))

for segment in segments:
    print(segment.text.strip())
PYEOF
