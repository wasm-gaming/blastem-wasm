/**
 * What BlastEm accepts, as types and as data.
 *
 * The four payloads of the wasm-gaming engine contract, closed for this engine, and
 * {@link BLASTEM_SPEC} — the same thing as data the contract's base class reads:
 * every default lives there and nowhere else.
 */
import type { EnginePayloads, EngineSpec } from '@wasm-gaming/engine-specs';

/** Bytes, or a thunk that produces them only when the engine actually needs them. */
export type BlastemAsset =
  | Uint8Array
  | ArrayBuffer
  | null
  | (() => Uint8Array | ArrayBuffer | null | Promise<Uint8Array | ArrayBuffer | null>);

/** The engine: fixed for the life of the wasm instance. */
export interface BlastemConfig {
  /** Console region. `auto` lets BlastEm read it from the ROM header. */
  region?: 'auto' | 'us' | 'eu' | 'jp';
  /** How the picture is scaled: crisp pixels (nearest) or linear filtering. */
  renderFilter?: 'pixelated' | 'smooth';
  /** BlastEm's own shader (its shaders/ folder): CRT, NTSC composite, xBRZ… */
  shader?: 'standard' | 'sharp' | 'crt' | 'ntsc' | 'xbrz';
  /** Dark lines between the picture's lines, as BlastEm draws them. */
  scanlines?: boolean;
  /** The border around the picture: BlastEm's default, hidden, or all of it. */
  border?: 'standard' | 'hidden' | 'full';
  /** Emscripten glue URL. Defaults to `./blastem.js` next to the SDK. */
  jsUrl?: string;
  /** WASM URL. Defaults to `./blastem.wasm` next to the SDK. */
  wasmUrl?: string;
}

/** The session. BlastEm has no per-session settings worth exposing yet. */
export type BlastemOptions = Record<string, never>;

export interface BlastemAssets {
  /** The cartridge: `.bin`, `.gen`, `.md` or `.smd`. Required to start. */
  rom?: BlastemAsset;
}

/** Where this engine's files live, and whether they outlive the page. */
export interface BlastemStorage {
  /**
   * Per-game folder for cartridge saves (SRAM/EEPROM) and save states.
   *
   * Relative to the engine's own folder: the SDK always prefixes `blastem/`, so the
   * files land in OPFS `blastem/<namespace>/` and no namespace can reach another
   * engine's files. Segments are cleaned (`.`/`..` dropped, odd characters → `_`);
   * anything unusable becomes `"default"`. `play.storagePath` gives the result.
   *
   * @defaultValue `"default"`
   */
  namespace?: string;
  /**
   * `null` keeps nothing: no saves are read or written. Leaving it out (or `'opfs'`)
   * mirrors the save folder to OPFS.
   */
  persist?: 'opfs' | null;
}

/** Engine events beyond the contract's core set. */
export interface BlastemEvents {
  /** Save files were just written to `blastem/<namespace>/` (names relative to it). */
  saves: { files: string[] };
}

export interface BlastemPayloads extends EnginePayloads {
  config: BlastemConfig;
  options: BlastemOptions;
  assets: BlastemAssets;
  storage: BlastemStorage;
  events: BlastemEvents;
}

/** The native picture, which the SDK scales to fit its mount. */
export const BLASTEM_VIDEO = { width: 640, height: 480, aspect: '4:3' } as const;

export const BLASTEM_SPEC: EngineSpec<BlastemPayloads> = {
  config: {
    region: {
      default: 'auto',
      enum: ['auto', 'us', 'eu', 'jp'],
      live: false,
      description: 'Console region; auto reads it from the ROM header.',
      label: { en: 'Region', es: 'Región' },
      group: 'emulation',
      valueLabels: [{ en: 'Auto', es: 'Automática' }, { en: 'USA', es: 'EE. UU.' }, { en: 'Europe', es: 'Europa' }, { en: 'Japan', es: 'Japón' }],
    },
    renderFilter: {
      default: 'pixelated',
      enum: ['pixelated', 'smooth'],
      live: true,
      description: 'Scaling: crisp pixels or linear filtering.',
      label: { en: 'Smoothing', es: 'Suavizado' },
      group: 'video',
      valueLabels: [{ en: 'Sharp pixels', es: 'Píxeles nítidos' }, { en: 'Smooth', es: 'Suavizado' }],
    },
    shader: {
      default: 'standard',
      enum: ['standard', 'sharp', 'crt', 'ntsc', 'xbrz'],
      live: true,
      description: "BlastEm's shaders: a CRT, the NTSC composite signal, xBRZ smoothing…",
      label: { en: 'Filter', es: 'Filtro' },
      group: 'video',
      valueLabels: [
        { en: 'None', es: 'Ninguno' },
        { en: 'Sharp', es: 'Nítido' },
        { en: 'CRT', es: 'CRT' },
        { en: 'NTSC composite', es: 'NTSC compuesto' },
        { en: 'xBRZ', es: 'xBRZ' },
      ],
    },
    scanlines: {
      default: false,
      live: true,
      description: 'Dark lines between the lines of the picture.',
      label: { en: 'Scanlines', es: 'Líneas de barrido' },
      group: 'video',
    },
    border: {
      default: 'hidden',
      enum: ['standard', 'hidden', 'full'],
      live: true,
      description: "The border around the picture: BlastEm's default (thin), hidden, or all of it.",
      label: { en: 'Border', es: 'Borde' },
      group: 'video',
      valueLabels: [{ en: 'Thin', es: 'Fino' }, { en: 'Hidden', es: 'Oculto' }, { en: 'Full', es: 'Completo' }],
    },
    jsUrl: { live: false, description: 'Emscripten glue URL. Defaults to ./blastem.js.' },
    wasmUrl: { live: false, description: 'WASM URL. Defaults to ./blastem.wasm.' },
  },
  options: {},
  assets: {
    rom: {
      allowedTypes: ['.bin', '.gen', '.md', '.smd'],
      live: false,
      description: 'The Mega Drive / Genesis cartridge. Required to start.',
    },
  },
  storage: {
    namespace: {
      default: 'default',
      live: false,
      description: "Folder for this game's saves, inside the engine's own blastem/ folder (OPFS blastem/<namespace>/).",
    },
    persist: {
      enum: ['opfs', null],
      live: false,
      description: 'null keeps nothing; otherwise saves are mirrored to OPFS.',
    },
  },
};
