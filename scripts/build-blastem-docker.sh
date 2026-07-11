#!/usr/bin/env bash
set -euo pipefail

# Build BlastEm WASM artifacts and write them to dist/blastem/ within this package.

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_DIR="$PROJECT_DIR/.tmp/blastem-build"
TARGET_DIR="$PROJECT_DIR/dist/blastem"

echo "Setting up workspace..."
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"
mkdir -p "$TARGET_DIR"

echo "Building BlastEm WASM via Docker..."
docker run --rm \
    -v "$WORK_DIR:/workspace" \
    -w /workspace \
    emscripten/emsdk:latest \
    bash -c "
      echo 'Installing mercurial and wget...'
      apt-get update -qq && apt-get install -y mercurial wget -qq
      echo 'Cloning BlastEm...'
      hg clone https://www.retrodev.com/repos/blastem/ .
      echo 'Patching Makefile...'
      sed -i 's/-Werror=pointer-arith//g' Makefile
      sed -i 's/-Werror=implicit-function-declaration//g' Makefile
      echo 'CFLAGS += -Wno-incompatible-pointer-types -Wno-implicit-function-declaration' >> Makefile
      echo 'Patching emscripten_pre.js to defer callMain to the SDK...'
      sed -i 's/Module.callMain();/if (Module.__autoStart) Module.callMain();/g' emscripten_pre.js
      echo 'Downloading a valid TTF font for BlastEm UI...'
      wget -q https://github.com/googlefonts/roboto/raw/main/src/hinted/Roboto-Regular.ttf -O DroidSans.ttf
      echo 'Running emmake...'
      emmake make CPU=wasm
      echo 'Done building.'
    "

echo "Copying artifacts to dist/blastem/..."
cp "$WORK_DIR/blastem.js" "$TARGET_DIR/"
cp "$WORK_DIR/blastem.wasm" "$TARGET_DIR/"

echo "-----------------------------------"
echo "BlastEm WASM artifacts available in $TARGET_DIR"
