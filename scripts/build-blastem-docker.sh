#!/usr/bin/env bash
set -euo pipefail

# Local wrapper: run scripts/build-blastem.sh inside the pinned emsdk image.
#
# Behind a TLS-intercepting proxy, set BUILD_CA_BUNDLE to its CA file: the proxy
# variables are passed through and the CA is trusted inside the container (wget for
# the sources, Emscripten for the SDL2 port). Where GitHub archives are not
# reachable at all, BUILD_SDL2_SRC=<checkout of libsdl-org/SDL at release-2.32.0>
# builds Emscripten's sdl2 port from that directory instead of downloading it.
# Without either, nothing changes.

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EMSDK_IMAGE="${EMSDK_IMAGE:-emscripten/emsdk:4.0.10}"

extra=()
if [ -n "${BUILD_CA_BUNDLE:-}" ]; then
  extra+=(--network host -v "$BUILD_CA_BUNDLE:/build-ca.crt:ro")
  for v in HTTPS_PROXY HTTP_PROXY NO_PROXY https_proxy http_proxy no_proxy; do
    [ -n "${!v:-}" ] && extra+=(-e "$v")
  done
fi

if [ -n "${BUILD_SDL2_SRC:-}" ]; then
  extra+=(-v "$(cd "$BUILD_SDL2_SRC" && pwd):/ports-src/sdl2:ro" -e BUILD_SDL2_LOCAL=1)
fi

docker run --rm \
  -v "$PROJECT_DIR:/workspace" \
  -w /workspace \
  -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" \
  "${extra[@]}" \
  "$EMSDK_IMAGE" \
  bash -c '
    set -euo pipefail
    if [ -f /build-ca.crt ]; then
      cp /build-ca.crt /usr/local/share/ca-certificates/build-ca.crt
      update-ca-certificates >/dev/null
      export SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt
    fi
    apt-get update -qq && apt-get install -y -qq wget >/dev/null
    if [ -n "${BUILD_SDL2_LOCAL:-}" ]; then
      # Build the port once from the local checkout, so the parallel make finds it ready.
      # Kept set for the whole build: emcc then reuses the copied port (under a lock)
      # instead of trying to download it again.
      export EMCC_LOCAL_PORTS=sdl2=/ports-src/sdl2
      embuilder build sdl2 >/dev/null 2>&1
    fi
    bash scripts/build-blastem.sh
    chown -R "$HOST_UID:$HOST_GID" dist .tmp
  '
