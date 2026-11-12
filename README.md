# @wasm-gaming/blastem-wasm

[BlastEm](https://www.retrodev.com/blastem/), the Sega Mega Drive / Genesis emulator by
Michael Pavone, compiled to WebAssembly and wrapped in a self-contained SDK that implements the
[wasm-gaming engine contract](https://github.com/wasm-gaming/engine-specs) 1.0.

## Install

```bash
npm install @wasm-gaming/blastem-wasm
```

The SDK carries the contract's runtime beside it (`dist/blastem/engine-specs.js`) and imports it
relatively: it loads from any static server, with no bundler and no import map. The wasm and its
glue (`blastem.js`, `blastem.wasm`) are built in CI and shipped in the GitHub Release
(`blastem.tar.gz`, layout `blastem/blastem/…`) and on Pages.

## Use

```js
import BlastemSDK from './blastem/blastem.sdk.js';

BlastemSDK.id;       // 'blastem' — also this engine's folder in OPFS
BlastemSDK.version;  // '0.2.0'

const play = await new BlastemSDK()
  .config({ region: 'auto', renderFilter: 'pixelated' })
  .assets({ rom: () => file.arrayBuffer() })       // bytes, or a thunk
  .storage({ namespace: 'old-towers' })            // → OPFS blastem/old-towers/
  .on('saves', ({ detail }) => console.log('saved', detail.files))
  .mount(document.querySelector('#stage'))         // a <canvas> is used as is; anything else gets one
  .start();

play.pause('menu');         // the first caller owns the pause…
play.resume('menu');        // …and only it lifts it; sound stops too
await play.restart();       // soft reset
await play.destroy();       // saves flushed, loop stopped, audio closed
```

| payload | keys |
| --- | --- |
| `config` | `region` (`auto` \| `us` \| `eu` \| `jp`), `renderFilter` (`pixelated` \| `smooth`, live), `jsUrl`, `wasmUrl` |
| `options` | — |
| `assets` | `rom` (`.bin`, `.gen`, `.md`, `.smd`; required) |
| `storage` | `namespace` (default `default`), `persist` (`'opfs'` \| `null`) |

Events: the contract's `start`, `error`, `exit`, `pause`, `resume`, plus `saves`.

Controls are BlastEm's defaults: arrows, `A`/`S`/`D` (A/B/C), `Q`/`W`/`E` (X/Y/Z), `Enter` (Start),
`` ` `` save state, `L` load state, `Tab` soft reset. Gamepads work through SDL2.

## Saves live in the engine's own folder

```
OPFS root
└── blastem/             ← BlastemSDK.id, added by the SDK
    └── <namespace>/     ← storage({ namespace }), default "default"
        ├── save.sram    ← cartridge SRAM / EEPROM / NOR
        └── *.state      ← save states
```

The wasm writes every save of the running game to MEMFS `/save`. The SDK seeds it from OPFS before
boot and mirrors back what changed after asking BlastEm to flush: every 10 s, on pause, when the
page is hidden and on `destroy()`. (Upstream only flushed at exit — a web page never exits — so
saves used to be lost.) `play.storagePath` gives the folder; `storagePath(engineId, namespace)` is
exported for hosts that need it before a session exists.

One BlastEm per page: after `destroy()`, a new game needs a new page (or iframe).

## Build

```bash
make build-sdk      # TypeScript → dist/blastem/ (fast, no Docker)
make test           # type-check + tests against the built package
make build-wasm     # BlastEm → WebAssembly in emscripten/emsdk:4.0.10 (Docker)
make demo           # dist/index.html: a no-build demo (pick or drop a ROM)
make preview        # serve dist/ on :8027
```

Everything is pinned: the upstream revision (Mercurial node + archive SHA-256), the UI font and the
emsdk image, so a commit always builds the same engine. Behind a TLS-intercepting proxy:
`BUILD_CA_BUNDLE=<ca.pem> make build-wasm`; where GitHub archives are unreachable,
`BUILD_SDL2_SRC=<libsdl-org/SDL checkout at release-2.32.0>` builds Emscripten's SDL2 port from it.

The wasm is ~31 MB, ~2.3 MB gzipped (BlastEm's generated 68000 core is most of it).

## Project Specs

- Contract 1.0 class (`BlastemSDK` / `BlastemPlay`), self-contained ESM, engine-specs as the one
  dependency; conformance line `BLASTEM_ENGINE` checked by `make test`.
- Engine-owned storage `blastem/<namespace>/`, save mirror with an explicit flush bridge.
- Pinned, reproducible wasm build (see [CORE.md](CORE.md) for what is patched upstream).
- Records of decisions in [RECORD/](RECORD/).

## Todos

- [ ] Optional `stats()` / frame counter for the launcher's core benchmark.
- [ ] Map more of BlastEm's config (scaling, vsync, sync source) to typed `config`.
- [ ] Try `-Os` for a smaller wasm and measure the cost.

## License

The SDK is MIT. BlastEm itself is GPL-3.0; the built `blastem.wasm` is a BlastEm binary.
