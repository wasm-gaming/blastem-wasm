# BlastEm Core Specifications

Technical reference for BlastEm core capabilities in this repository.

This document summarizes:
- Core command-line flags supported by upstream BlastEm
- Default runtime config blocks and notable keys
- What is currently exposed by this TypeScript WASM wrapper

## Source of truth

The entries below are derived from:
- `.tmp/blastem-build/blastem.c` (CLI argument parsing and help text)
- `.tmp/blastem-build/default.cfg` (default runtime configuration)

If upstream BlastEm changes, regenerate and re-check these files.

## Core CLI Flags

BlastEm CLI usage string:

```text
Usage: blastem [OPTIONS] ROMFILE [WIDTH] [HEIGHT]
```

Supported options in upstream core:

- `-h`: print help text.
- `-r (J|U|E)`: force region to Japan/US/Europe.
- `-m MACHINE`: force machine type.
  - Valid values: `sms`, `gg`, `sg`, `sc`, `gen`, `32x`, `32xcd`, `pico`, `copera`, `media`, `laser`.
- `-f`: toggle fullscreen mode.
- `-g`: disable OpenGL rendering (use SDL fallback renderer).
- `-s FILE`: load savestate (GST format).
- `-o FILE`: load lock-on cartridge.
- `-d`: enter debugger on startup.
- `-dm`: enter debugger on startup and allow debugging menu target.
- `-D`: initialize GDB remote debugger and start in debugger.
- `-n`: disable Z80.
- `-v`: print version and exit.
- `-l`: log 68K addresses.
- `-y`: log YM-2612 channels to WAVE files.
- `-e FILE`: write hardware event log to file.
- `-e HOST:PORT`: stream hardware event log via TCP.
- `-b N`: headless mode, exit after `N` frames.
- `-t`: force no terminal.

Positional args:
- `ROMFILE`: ROM/media path.
- `WIDTH` (optional): output width override.
- `HEIGHT` (optional): output height override.

## Default Runtime Config (default.cfg)

Key sections and notable options from upstream `default.cfg`:

### video

- `aspect` (example: `4:3`, supports special value `stretch`)
- `width`, `height`
- `vertex_shader`, `fragment_shader`
- `scanlines` (`on|off`)
- `vsync` (`on|off`)
- `fullscreen` (`on|off`)
- `integer_scaling` (`on|off`)
- `gl` (`on|off`)
- `scaling` (`linear|nearest`)
- `npot_textures` (`on|off`)
- overscan sub-blocks for `ntsc`, `pal`, `gamegear`

### audio

- `rate` (sample rate)
- `buffer` (buffer size)
- `lowpass_cutoff`
- `format` (`f32|s16`)

### system

- `sync_source` (`audio|video`)
- `ram_init` (`zero|random`)
- `default_region` (`U|E|J`)
- `force_region` (`on|off`)
- `megawifi` (`on|off`)
- `model` (hardware model identifier)

### ui

- `rom` (menu ROM)
- `initial_path`, `remember_path`
- `screenshot_path`, `screenshot_template`
- `vgm_path`, `vgm_template`
- `save_path`
- `extensions` (visible media extensions in menu)
- `state_format` (`native|gst`)
- `use_native_filechooser` (`on|off`)

### clocks

- `m68k_divider`
- `max_cycles`
- speed presets (`speeds` block)

### bindings / io

- keyboard bindings (`bindings.keys`)
- gamepad mappings (`bindings.pads`)
- mouse bindings (`bindings.mice`)
- I/O device topology (`io.devices`, multitaps)

## Wrapper Exposure Status (this package)

Current TypeScript wrapper options in `src/blastem.options.ts`:

- `romFileName?: string`
- `region?: 'auto' | 'us' | 'eu' | 'jp'`
- `renderFilter?: 'pixelated' | 'smooth'`

Notes:
- `renderFilter` is a wrapper-level canvas CSS choice (`image-rendering`), not a direct BlastEm `default.cfg video.scaling` toggle.
- Most upstream core flags/config keys are not yet mapped to typed SDK options.

## Potential Future Mappings

Reasonable next options to expose in SDK:

- `videoScaling: 'nearest' | 'linear'` (core-like semantic)
- `integerScaling: boolean`
- `vsync: boolean`
- `syncSource: 'audio' | 'video'`
- `audioBuffer: number`
- `forceMachine` and broader machine selection for non-Genesis targets

Any mapping should specify whether it is:
- wrapper-only behavior (CSS/runtime glue), or
- direct core behavior (passed to BlastEm runtime/config).
