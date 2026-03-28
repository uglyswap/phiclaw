#!/usr/bin/env bash
#
# phiclaw-workspace-init.sh — Initialize/update the PhiClaw workspace with agent catalog
#
# ALWAYS regenerates AGENTS.md to ensure the catalog reflects current agents.
#
set -euo pipefail

WORKSPACE_DIR="${1:-${HOME}/.openclaw/workspace}"

echo "[phiclaw-init] Generating agent catalog..."
mkdir -p "$WORKSPACE_DIR"

if command -v node >/dev/null 2>&1 && [ -f "/app/scripts/generate-agents-catalog.cjs" ]; then
    node /app/scripts/generate-agents-catalog.cjs "${WORKSPACE_DIR}/AGENTS.md"
    echo "[phiclaw-init] ✅ AGENTS.md generated ($(wc -c < "${WORKSPACE_DIR}/AGENTS.md") bytes)"
else
    echo "[phiclaw-init] ⚠️  Cannot generate AGENTS.md (node or script missing)"
fi
