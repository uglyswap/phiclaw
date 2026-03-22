#!/bin/bash
# setup-qmd.sh — Initialise QMD collections on first launch.
# Run once after container creation or when collections are empty.
set -euo pipefail

QMD="/app/scripts/qmd-wrapper.sh"
WORKSPACE="${HOME}/.openclaw/workspace"
MEMORY_DIR="${WORKSPACE}/memory"

echo "=== QMD Setup ==="

# Ensure cache directory exists
mkdir -p "${HOME}/.cache/qmd"

# Verify QMD is functional
if ! "$QMD" status >/dev/null 2>&1; then
    echo "ERROR: QMD is not functional. Run check-qmd.sh first."
    exit 1
fi

# Check if collections already exist
STATUS=$("$QMD" status 2>&1)
if echo "$STATUS" | grep -q "No collections"; then
    echo "No collections found — creating defaults..."

    # Index the memory directory (daily notes, MEMORY.md, etc.)
    if [ -d "$MEMORY_DIR" ]; then
        "$QMD" collection add "$MEMORY_DIR" 2>&1
        echo "✓ Added memory/ collection"
    else
        mkdir -p "$MEMORY_DIR"
        "$QMD" collection add "$MEMORY_DIR" 2>&1
        echo "✓ Created and added memory/ collection"
    fi

    # Index top-level workspace files (MEMORY.md, SOUL.md, etc.)
    "$QMD" collection add "$WORKSPACE" --pattern "*.md" 2>&1
    echo "✓ Added workspace *.md collection"
else
    echo "Collections already exist — skipping creation."
fi

echo ""
echo "=== QMD Status ==="
"$QMD" status 2>&1 | head -20
echo ""
echo "QMD setup complete ✓"
