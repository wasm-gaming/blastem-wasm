#!/usr/bin/env bash
set -euo pipefail

# Build BlastEm to WebAssembly → dist/blastem/blastem.{js,wasm}.
#
# Everything is pinned, so a given commit of this repo always builds the same
# engine: the upstream revision (by Mercurial node, archive hash checked), the UI
# font, and the emsdk image (scripts/build-blastem-docker.sh). Runs inside
# emscripten/emsdk; locally `make build-wasm` does that through Docker.

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_DIR="${WORK_DIR:-$PROJECT_DIR/.tmp/blastem-build}"
TARGET_DIR="${TARGET_DIR:-$PROJECT_DIR/dist/blastem}"

BLASTEM_REV="${BLASTEM_REV:-6d1a7447ee9e}"   # default branch, v1.0.0+22
BLASTEM_SHA256="${BLASTEM_SHA256:-1cbd3caa1303b401601445af1ed488542b7f75e163e5b9d213a6a1710ea2e317}"
BLASTEM_URL="https://www.retrodev.com/repos/blastem/archive/${BLASTEM_REV}.tar.gz"
FONT_URL="https://raw.githubusercontent.com/googlefonts/roboto/v2.138/src/hinted/Roboto-Regular.ttf"
FONT_SHA256="56a45233d29f11b4dfb86d248e921939d115778f87325e7ae8cc108383d6664d"

for cmd in wget tar sha256sum emmake; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "error: '$cmd' is not available" >&2; exit 1; }
done

fetch() { # url sha256 dest
  wget -q "$1" -O "$3"
  echo "$2  $3" | sha256sum -c --quiet - || { echo "error: checksum mismatch for $1" >&2; exit 1; }
}

echo "Preparing BlastEm ${BLASTEM_REV}..."
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR" "$TARGET_DIR"
fetch "$BLASTEM_URL" "$BLASTEM_SHA256" "$WORK_DIR/blastem-src.tar.gz"
tar -xzf "$WORK_DIR/blastem-src.tar.gz" -C "$WORK_DIR" --strip-components=1
rm -f "$WORK_DIR/blastem-src.tar.gz"
fetch "$FONT_URL" "$FONT_SHA256" "$WORK_DIR/DroidSans.ttf"

cd "$WORK_DIR"

echo "Patching..."
# Newer clang rejects what upstream's flags turn into errors.
sed -i 's/-Werror=pointer-arith//g; s/-Werror=implicit-function-declaration//g' Makefile
echo 'CFLAGS += -Wno-incompatible-pointer-types -Wno-implicit-function-declaration' >> Makefile

# The SDK owns startup and persistence (see scripts/emscripten_pre.js).
cp "$PROJECT_DIR/scripts/emscripten_pre.js" emscripten_pre.js
sed -i 's# -lidbfs.js##' Makefile

# One save folder per running game; the SDK mirrors it to OPFS <engine>/<namespace>/.
sed -i 's#^\(\s*\)save_path \$USERDATA/blastem/\$ROMNAME#\1save_path /save#' default.cfg
grep -q 'save_path /save' default.cfg || { echo "error: could not patch save_path" >&2; exit 1; }

# Bridge functions the SDK calls (save flush, soft reset).
cat "$PROJECT_DIR/scripts/web_bridge.c" >> blastem.c

# ES module factory, FS for the SDK, and the bridge + main-loop control exported.
sed -i 's#-sEXPORTED_FUNCTIONS=_main,_handle_chooser_result#-sEXPORTED_FUNCTIONS=_main,_handle_chooser_result,_web_persist_save,_web_soft_reset,_web_save_state,_web_load_state,_emscripten_pause_main_loop,_emscripten_resume_main_loop#' Makefile
sed -i 's#-sEXPORTED_RUNTIME_METHODS=ccall,cwrap,callMain#-sEXPORTED_RUNTIME_METHODS=ccall,cwrap,callMain,FS -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createBlastem -sENVIRONMENT=web#' Makefile
# An ES module factory cannot be emitted as an .html page: link to blastem.js.
sed -i 's#^EXE:=.html#EXE:=.js#' Makefile
grep -q '_web_persist_save' Makefile && grep -q 'MODULARIZE' Makefile || { echo "error: could not patch link flags" >&2; exit 1; }

echo "Building..."
emmake make CPU=wasm -j"$(nproc)" blastem.js

test -f blastem.js && test -f blastem.wasm
cp blastem.js blastem.wasm "$TARGET_DIR/"
ls -la "$TARGET_DIR"/blastem.js "$TARGET_DIR"/blastem.wasm
