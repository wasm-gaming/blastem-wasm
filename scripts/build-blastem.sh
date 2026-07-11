#!/usr/bin/env bash
set -euo pipefail

# Build BlastEm WASM artifacts and write them to dist/blastem/ within this package.

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_DIR="${WORK_DIR:-$PROJECT_DIR/.tmp/blastem-build}"
TARGET_DIR="${TARGET_DIR:-$PROJECT_DIR/dist/blastem}"
BLASTEM_ARCHIVE_URL="${BLASTEM_ARCHIVE_URL:-https://www.retrodev.com/repos/blastem/archive/tip.tar.gz}"

ensure_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "error: required command '$1' is not available" >&2
    exit 1
  fi
}

echo "Setting up workspace..."
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"
mkdir -p "$TARGET_DIR"

echo "Preparing BlastEm sources..."
ensure_cmd wget
ensure_cmd tar
ensure_cmd emmake

wget -q "$BLASTEM_ARCHIVE_URL" -O "$WORK_DIR/blastem-src.tar.gz"
tar -xzf "$WORK_DIR/blastem-src.tar.gz" -C "$WORK_DIR" --strip-components=1
rm -f "$WORK_DIR/blastem-src.tar.gz"

cd "$WORK_DIR"
test -f Makefile

echo "Patching Makefile..."
sed -i 's/-Werror=pointer-arith//g' Makefile
sed -i 's/-Werror=implicit-function-declaration//g' Makefile
echo 'CFLAGS += -Wno-incompatible-pointer-types -Wno-implicit-function-declaration' >> Makefile

if [ -f emscripten_pre.js ]; then
  echo "Patching emscripten_pre.js to defer callMain to the SDK..."
  sed -i 's/Module.callMain();/if (Module.__autoStart) Module.callMain();/g' emscripten_pre.js
else
  echo "emscripten_pre.js not found; skipping callMain patch."
fi

echo "Downloading a valid TTF font for BlastEm UI..."
wget -q https://github.com/googlefonts/roboto/raw/main/src/hinted/Roboto-Regular.ttf -O DroidSans.ttf

echo "Running emmake..."
emmake make CPU=wasm

test -f blastem.js
test -f blastem.wasm

echo "Copying artifacts to dist/blastem/..."
cp "$WORK_DIR/blastem.js" "$TARGET_DIR/"
cp "$WORK_DIR/blastem.wasm" "$TARGET_DIR/"

echo "-----------------------------------"
echo "BlastEm WASM artifacts available in $TARGET_DIR"