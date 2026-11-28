#!/usr/bin/env bash

set -euo pipefail
cd "$(dirname "$0")"

echo "Installing yt-dlp (native Linux binary)..."

mkdir -p bin

# Download the native Linux binary (no Python required, fully self-contained).
# yt-dlp_linux is a statically linked executable that works on any Linux x86_64.
curl --fail --location --retry 3 \
  "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux" \
  -o bin/yt-dlp

chmod a+rx bin/yt-dlp

echo "Verifying yt-dlp..."
./bin/yt-dlp --version

echo "Verifying ffmpeg..."
ffmpeg -version | head -1

echo "Build dependencies ready!"
