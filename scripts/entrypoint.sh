#!/bin/bash
# PhiClaw entrypoint — runs first-launch setup then starts the gateway.
# This script is the Docker CMD wrapper that ensures QMD collections and
# audio models are ready before handing off to the OpenClaw gateway.

set -e

SETUP_MARKER="${HOME}/.openclaw/.phiclaw-setup-done"
QMD_WRAPPER="/app/scripts/qmd-wrapper.sh"
SETUP_QMD="/app/scripts/setup-qmd.sh"

# ── First-launch setup (runs once, then skips) ──────────────────
if [ ! -f "$SETUP_MARKER" ]; then
    echo "[phiclaw] First launch detected — running setup..."

    # 1. QMD collections
    if [ -x "$SETUP_QMD" ]; then
        echo "[phiclaw] Initializing QMD collections..."
        bash "$SETUP_QMD" 2>&1 || echo "[phiclaw] QMD setup had warnings (non-fatal)"

        # 2. Run embedding (downloads model on first run ~330MB)
        echo "[phiclaw] Running QMD embedding (first run downloads model)..."
        "$QMD_WRAPPER" embed 2>&1 || echo "[phiclaw] QMD embed had warnings (non-fatal)"
    fi

    # Mark setup as done
    mkdir -p "$(dirname "$SETUP_MARKER")"
    date -Iseconds > "$SETUP_MARKER"
    echo "[phiclaw] First-launch setup complete."
else
    echo "[phiclaw] Setup already done ($(cat "$SETUP_MARKER")). Skipping."
fi

# ── Start the gateway ────────────────────────────────────────────
echo "[phiclaw] Starting OpenClaw gateway..."
exec node /app/dist/index.js "$@"
