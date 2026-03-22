#!/bin/bash
# QMD 2 wrapper — routes QMD CLI calls through the baked-in Bun install.
# Disables CUDA to avoid spurious build errors on CPU-only containers.
export XDG_CACHE_HOME="${HOME}/.cache"
export CUDA_PATH=""
exec node /app/qmd/node_modules/@tobilu/qmd/dist/cli/qmd.js "$@"
