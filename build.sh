#!/usr/bin/env bash

set -euo pipefail
cd "$(dirname "$0")"

echo "Installing yt-dlp..."

mkdir -p bin

curl --fail --location --retry 3 https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
  -o bin/yt-dlp

chmod +x bin/yt-dlp

echo "Checking yt-dlp..."
./bin/yt-dlp --version
ffmpeg -version

echo "Build dependencies ready!"
