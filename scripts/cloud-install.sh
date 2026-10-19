#!/usr/bin/env bash
set -euo pipefail
cd /workspace/SogiT-mose-Ai
command -v node >/dev/null
command -v ffmpeg >/dev/null
command -v ffprobe >/dev/null
npm --cache /tmp/sogit-npm-cache ci --ignore-scripts --no-audit --no-fund
export electron_config_cache=/tmp/sogit-electron-cache
if [ -n "${HTTPS_PROXY:-}" ]; then
  export ELECTRON_GET_USE_PROXY=1
  export GLOBAL_AGENT_HTTP_PROXY="$HTTPS_PROXY"
fi
node node_modules/electron/install.js
npm run build
npm test
