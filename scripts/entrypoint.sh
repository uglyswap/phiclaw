#!/bin/bash
# PhiClaw entrypoint — runs setup then starts the gateway.
set -e

SETUP_MARKER="${HOME}/.openclaw/.phiclaw-setup-done"
QMD_WRAPPER="/app/scripts/qmd-wrapper.sh"
SETUP_QMD="/app/scripts/setup-qmd.sh"
CONFIG_FILE="${HOME}/.openclaw/openclaw.json"

# ── First-launch setup (QMD, runs once) ──────────────────
if [ ! -f "$SETUP_MARKER" ]; then
    echo "[phiclaw] First launch detected — running setup..."

    if [ -x "$SETUP_QMD" ]; then
        echo "[phiclaw] Initializing QMD collections..."
        bash "$SETUP_QMD" 2>&1 || echo "[phiclaw] QMD setup had warnings (non-fatal)"

        echo "[phiclaw] Running QMD embedding (first run downloads model)..."
        "$QMD_WRAPPER" embed 2>&1 || echo "[phiclaw] QMD embed had warnings (non-fatal)"
    fi

    date -Iseconds > "$SETUP_MARKER"
    echo "[phiclaw] First-launch setup complete."
else
    echo "[phiclaw] Setup already done ($(cat "$SETUP_MARKER")). Skipping."
fi

# ── ALWAYS regenerate AGENTS.md (reflects current agent files) ──
PHICLAW_WORKSPACE_INIT="/app/scripts/phiclaw-workspace-init.sh"
if [ -x "$PHICLAW_WORKSPACE_INIT" ]; then
    bash "$PHICLAW_WORKSPACE_INIT" 2>&1 || echo "[phiclaw] Workspace init had warnings (non-fatal)"
fi

# ── Ensure bootstrapMaxChars is high enough for AGENTS.md ──
# The agent catalog is ~25KB; OpenClaw default is 20000 which truncates it.
if [ -f "$CONFIG_FILE" ] && command -v node >/dev/null 2>&1; then
    node /app/scripts/patch-bootstrap-limit.cjs "$CONFIG_FILE" 2>&1 || true
fi

# ── Start gateway ──
echo "[phiclaw] Starting OpenClaw gateway..."
exec node dist/index.js "$@"
