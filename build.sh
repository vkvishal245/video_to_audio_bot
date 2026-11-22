#!/usr/bin/env bash

set -e

echo "Installing yt-dlp..."

mkdir -p bin

curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
  -o bin/yt-dlp

chmod +x bin/yt-dlp

echo "Checking yt-dlp..."
./bin/yt-dlp --version

echo "Build dependencies ready!"