// Replaces upstream's emscripten_pre.js for the wasm-gaming build.
//
// Upstream mounts IDBFS on /home/web_user and calls main() as soon as the runtime
// is up. Here the SDK owns both: it writes the ROM and the saves into MEMFS, then
// calls main itself; persistence goes to OPFS <engine-id>/<namespace>/ through the
// SDK's save mirror, not to an origin-wide IndexedDB store.
Module.noInitialRun = true;
