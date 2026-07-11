# @wasm-gaming/blastem-wasm

BlastEm (Sega Mega Drive / Genesis emulator by retrodev) compiled to WebAssembly via Emscripten, packaged as a wasm-gaming engine SDK.

This subproject follows the same engine-package approach used by jgenesis-wasm, rsdkv3, and rsdkv4:
- typed `manifest`
- typed `options`
- `load(config)` engine SDK surface
- Makefile-driven build (`build-sdk`, `build-wasm`, `preview`)

## Contract surface

```js
import { manifest, load } from '@wasm-gaming/blastem-wasm';

const engine = await load({
  canvas,
  assets: { rom: romBytes },
  onEvent: (e) => console.log(e),
});
engine.start();
```

## Build

```sh
make build        # Full build: WASM (Docker/Emscripten) + TypeScript SDK
make build-sdk    # TypeScript only (SDK + manifest)
make build-wasm   # BlastEm WASM only (via Docker)
make preview      # Serve dist/ with COOP/COEP headers
```

## WASM artifacts

| File | Description |
|------|-------------|
| `blastem.js` | Emscripten-generated JS loader |
| `blastem.wasm` | Compiled BlastEm runtime |

BlastEm uses Emscripten SDL2. The JS loader expects a `<canvas id="canvas">` in the DOM.
ROM bytes are written to the in-memory MEMFS at `/rom/game.bin` before the emulator boots.
