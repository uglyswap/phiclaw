#!/bin/bash
# check-qmd.sh — Verify QMD health and auto-repair better-sqlite3 if broken.
# Called after OpenClaw updates, container recreation, or by watchdog cron.
set -euo pipefail

QMD_JS="/app/qmd/node_modules/@tobilu/qmd/dist/cli/qmd.js"
QMD_DIR="/app/qmd"

echo "=== QMD Health Check ==="

# Test 1: QMD can load and list collections
if ! node "$QMD_JS" collection list > /dev/null 2>&1; then
    echo "⚠ QMD BROKEN: cannot load"

    # Attempt auto-fix: rebuild better-sqlite3 native bindings
    echo "Attempting auto-fix: rebuilding better-sqlite3..."
    SQLITE_DIR="$QMD_DIR/node_modules/better-sqlite3"
    if [ -d "$SQLITE_DIR" ]; then
        cd "$SQLITE_DIR"
        npx node-gyp rebuild > /tmp/qmd-rebuild.log 2>&1 || true
        cd "$QMD_DIR"
    fi

    # Re-test
    if node "$QMD_JS" collection list > /dev/null 2>&1; then
        echo "✓ QMD FIXED: auto-rebuild successful"
        exit 0
    else
        echo "✗ QMD STILL BROKEN: auto-fix failed"
        echo "  Check /tmp/qmd-rebuild.log for details"
        exit 1
    fi
fi

# Test 2: QMD can search without native module errors
RESULT=$(node "$QMD_JS" search "test" --json -n 1 2>&1 || true)
if echo "$RESULT" | grep -qE "ENOTDIR|DLOPEN|NODE_MODULE_VERSION"; then
    echo "⚠ QMD BROKEN: search fails with native module error"
    echo "  Error: $RESULT"
    exit 1
fi

echo "✓ QMD OK"
exit 0
