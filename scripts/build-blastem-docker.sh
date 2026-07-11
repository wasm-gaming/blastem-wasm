#!/usr/bin/env bash
set -euo pipefail

# Local wrapper: run BlastEm build inside Docker.

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_SCRIPT="/workspace/scripts/build-blastem.sh"

echo "Building BlastEm WASM via Docker..."
docker run --rm \
    -v "$PROJECT_DIR:/workspace" \
    -w /workspace \
    emscripten/emsdk:latest \
    bash -c "
      set -euo pipefail
      echo 'Installing wget and tar...'
      apt-get update -qq && apt-get install -y wget tar -qq
      test -x $BUILD_SCRIPT || chmod +x $BUILD_SCRIPT
      $BUILD_SCRIPT
    "
