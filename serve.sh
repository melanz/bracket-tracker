#!/usr/bin/env bash
# Serve the bracket site so the browser can load data/*.csv (required — file:// will not work).
cd "$(dirname "$0")"
PORT="${1:-8080}"
echo "Open: http://127.0.0.1:${PORT}/index.html"
echo "Press Ctrl+C to stop."
exec python3 -m http.server "$PORT"
