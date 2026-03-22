#!/usr/bin/env bash
# setup-audio.sh — Verify audio toolchain and download Whisper model on first run.
# This script is idempotent: safe to call multiple times.
set -euo pipefail

MODEL_SIZE="${WHISPER_MODEL_SIZE:-small}"
CACHE_DIR="${HF_HOME:-$HOME/.cache/huggingface}"

echo "╔══════════════════════════════════════════╗"
echo "║   PhiClaw Audio Setup                    ║"
echo "╚══════════════════════════════════════════╝"

# ── 1. Check ffmpeg ─────────────────────────────────────────────
if command -v ffmpeg &>/dev/null; then
  echo "✅ ffmpeg $(ffmpeg -version 2>&1 | head -1 | awk '{print $3}')"
else
  echo "❌ ffmpeg not found. Install it: apt-get install -y ffmpeg"
  exit 1
fi

# ── 2. Check faster-whisper ─────────────────────────────────────
if python3 -c "import faster_whisper; print(f'✅ faster-whisper {faster_whisper.__version__}')" 2>/dev/null; then
  :
else
  echo "❌ faster-whisper not found. Install it: pip install faster-whisper"
  exit 1
fi

# ── 3. Check edge-tts ──────────────────────────────────────────
if command -v edge-tts &>/dev/null; then
  echo "✅ edge-tts $(edge-tts --version 2>&1 || echo 'installed')"
else
  echo "❌ edge-tts not found. Install it: pip install edge-tts"
  exit 1
fi

# ── 4. Download Whisper model if absent ─────────────────────────
echo ""
echo "Checking Whisper model '${MODEL_SIZE}'..."
python3 - <<PYEOF
from faster_whisper import WhisperModel
import sys, os

model_size = os.environ.get("WHISPER_MODEL_SIZE", "small")
cache_dir = os.environ.get("HF_HOME", os.path.expanduser("~/.cache/huggingface"))

print(f"Model: {model_size}  |  Cache: {cache_dir}")
print("Loading model (will download on first run, ~500MB for 'small')...")

try:
    model = WhisperModel(model_size, device="cpu", compute_type="int8",
                         download_root=cache_dir)
    print(f"✅ Whisper model '{model_size}' ready")
except Exception as e:
    print(f"❌ Failed to load model: {e}", file=sys.stderr)
    sys.exit(1)
PYEOF

# ── 5. Create workspace directories ────────────────────────────
WORKSPACE="${OPENCLAW_WORKSPACE:-$HOME/.openclaw/workspace}"
mkdir -p "${WORKSPACE}/audio/tmp" "${WORKSPACE}/audio/cache"
echo "✅ Audio directories ready: ${WORKSPACE}/audio/"

echo ""
echo "══════════════════════════════════════════"
echo "  Audio setup complete! 🎤"
echo "══════════════════════════════════════════"
