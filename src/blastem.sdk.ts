/**
 * The engine package's entry point: an `EngineSDK` for BlastEm, the Sega Mega Drive /
 * Genesis emulator.
 *
 * ```js
 * import BlastemSDK from '@wasm-gaming/blastem-wasm';
 *
 * const play = await new BlastemSDK()
 *   .assets({ rom: () => readRom() })        // bytes, or a thunk
 *   .storage({ namespace: 'old-towers' })    // → OPFS blastem/old-towers/
 *   .mount(document.querySelector('#stage'))
 *   .start();
 *
 * play.pause('menu'); play.resume('menu');
 * await play.restart();                       // soft reset
 * await play.destroy();                       // saves flushed, loop stopped, audio closed
 * ```
 *
 * Everything a host drives is the contract's (`@wasm-gaming/engine-specs`); what is
 * this engine's own: {@link BlastemConfig} and friends, owner-aware
 * {@link BlastemPlay.pause} / {@link BlastemPlay.resume}, {@link BlastemPlay.storagePath}
 * and the `saves` event.
 *
 * Saves: the wasm build writes every save of the running game to MEMFS `/save`
 * (upstream's `save_path`, patched). The SDK seeds it from OPFS `blastem/<namespace>/`
 * before boot and mirrors it back after asking BlastEm to flush (`web_persist_save`):
 * every 10 s, on pause, when the page is hidden and on destroy. Upstream only flushed
 * at exit, which a web page never reaches.
 */
import {
  EnginePlayBase,
  EngineSDKBase,
  EventEmitter,
  type EngineInit,
  type EngineSDKConstructor,
  type EventsOf,
} from '@wasm-gaming/engine-specs';
import {
  BLASTEM_SPEC,
  BLASTEM_VIDEO,
  type BlastemAsset,
  type BlastemConfig,
  type BlastemOptions,
  type BlastemPayloads,
} from './blastem.options.js';

export type {
  BlastemAsset,
  BlastemAssets,
  BlastemConfig,
  BlastemEvents,
  BlastemOptions,
  BlastemPayloads,
  BlastemStorage,
} from './blastem.options.js';
export { BLASTEM_SPEC, BLASTEM_VIDEO } from './blastem.options.js';

const ENGINE_ID = 'blastem';
const DEFAULT_STORAGE_NAMESPACE = 'default';
const SAVE_DIR = '/save';
const ROM_DIR = '/rom';
const SAVE_INTERVAL_MS = 10_000;
const REGION_FLAG = { us: 'U', eu: 'E', jp: 'J' } as const;

/** The Emscripten module this build produces (`createBlastem` from blastem.js). */
interface BlastemModule {
  FS: {
    mkdir(path: string): void;
    writeFile(path: string, data: Uint8Array): void;
    readFile(path: string): Uint8Array;
    readdir(path: string): string[];
    stat(path: string): { mode: number };
    isFile(mode: number): boolean;
  };
  callMain(args: string[]): void;
  _web_persist_save(): void;
  _web_soft_reset(): void;
  _emscripten_pause_main_loop(): void;
  _emscripten_resume_main_loop(): void;
  SDL2?: { audioContext?: AudioContext };
}

type BlastemFactory = (overrides: Record<string, unknown>) => Promise<BlastemModule>;

/**
 * Where an engine keeps one namespace: `<engineId>/<namespace>`, relative to the OPFS
 * root. Identical to rsdkv4's, written to move verbatim into engine-specs: segments
 * cleaned, `.` and `..` dropped, anything outside `[A-Za-z0-9._-]` → `_`, nothing
 * usable → `default`; a leading `<engineId>/` is stripped once.
 */
export function storagePath(
  engineId: string,
  namespace: unknown,
): { namespace: string; path: string; prefixed: boolean } {
  const segments =
    typeof namespace === 'string'
      ? namespace
          .split('/')
          .map((segment) => segment.trim())
          .filter((segment) => segment && segment !== '.' && segment !== '..')
          .map((segment) => segment.replace(/[^A-Za-z0-9._-]/g, '_'))
      : [];
  const prefixed = segments.length > 1 && segments[0] === engineId;
  if (prefixed) segments.shift();
  const cleaned = segments.join('/') || DEFAULT_STORAGE_NAMESPACE;
  return { namespace: cleaned, path: `${engineId}/${cleaned}`, prefixed };
}

async function opfsDir(path: string, create: boolean): Promise<FileSystemDirectoryHandle | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) return null;
  try {
    let dir = await navigator.storage.getDirectory();
    for (const segment of path.split('/').filter(Boolean)) {
      dir = await dir.getDirectoryHandle(segment, { create });
    }
    return dir;
  } catch {
    return null;
  }
}

async function resolveAsset(asset: BlastemAsset | undefined): Promise<Uint8Array | null> {
  const value = typeof asset === 'function' ? await asset() : asset;
  if (value == null) return null;
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new TypeError('blastem: an asset must be a Uint8Array, an ArrayBuffer or a thunk returning one');
}

function sameBytes(a: Uint8Array | undefined, b: Uint8Array): boolean {
  if (!a || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** The ROM's extension, so BlastEm sees the file the way the player named it. */
function romName(bytes: Uint8Array): string {
  // SMD-interleaved dumps start with a 512-byte header; BlastEm detects them by content.
  return bytes.length % 0x4000 === 512 ? 'game.smd' : 'game.bin';
}

/** The live engine: one booted BlastEm and its session. */
export class BlastemPlay extends EnginePlayBase<BlastemPayloads> {
  #module: BlastemModule | null = null;
  #destroyed = false;
  #pauseOwner: string | null = null;

  #canvas: HTMLCanvasElement | null = null;
  #ownsCanvas = false;
  #box: HTMLElement | null = null;
  #boxObserver: ResizeObserver | null = null;

  #namespace = DEFAULT_STORAGE_NAMESPACE;
  #storagePath = `${ENGINE_ID}/${DEFAULT_STORAGE_NAMESPACE}`;
  #persist = true;
  #saveTimer: ReturnType<typeof setInterval> | null = null;
  #lastSaved = new Map<string, Uint8Array>();
  #flushing: Promise<void> | null = null;
  #onHidden = (): void => {
    if (document.visibilityState === 'hidden') void this.flushSaves();
  };

  constructor(init?: EngineInit<BlastemPayloads>, events?: EventEmitter<EventsOf<BlastemPayloads>>) {
    super(BLASTEM_SPEC, init, events);
  }

  /** The normalised namespace this session uses. */
  get namespace(): string {
    return this.#namespace;
  }

  /** Where this session's saves live, relative to the OPFS root: `blastem/<namespace>`. */
  get storagePath(): string {
    return this.#storagePath;
  }

  /** Who holds the pause, or null while running. */
  get pausedBy(): string | null {
    return this.#pauseOwner;
  }

  /**
   * Freeze emulation and sound. The first caller owns the pause, and only that
   * owner's {@link resume} lifts it, so an overlay cannot resume a game the host had
   * already frozen. Saves are flushed, since a paused game is often a closed one.
   */
  pause(owner = 'host'): void {
    const Module = this.#module;
    if (!Module || this.#pauseOwner) return;
    this.#pauseOwner = owner;
    Module._emscripten_pause_main_loop();
    void Module.SDL2?.audioContext?.suspend();
    void this.flushSaves();
    this.emit('pause', { owner });
  }

  resume(owner = 'host'): void {
    const Module = this.#module;
    if (!Module || this.#pauseOwner !== owner) return;
    this.#pauseOwner = null;
    void Module.SDL2?.audioContext?.resume();
    Module._emscripten_resume_main_loop();
    this.emit('resume', { owner });
  }

  /**
   * Ask BlastEm to write its saves, then copy whatever changed in `/save` to OPFS
   * `blastem/<namespace>/`. Emits `saves` with the files that moved. Safe to call any
   * time; overlapping calls share one flush.
   */
  flushSaves(): Promise<void> {
    this.#flushing ??= this.#flush().finally(() => {
      this.#flushing = null;
    });
    return this.#flushing;
  }

  // ---- Contract hooks ----

  protected override mounted(target: HTMLElement): void {
    if (target instanceof HTMLCanvasElement) {
      this.#canvas = target;
      this.#ownsCanvas = false;
      this.#box = target.parentElement;
    } else {
      this.#canvas = document.createElement('canvas');
      this.#ownsCanvas = true;
      this.#box = target;
      target.appendChild(this.#canvas);
    }
    const canvas = this.#canvas;
    // Emscripten's SDL2 finds its window by id, and measures the element: no border or
    // padding on the canvas itself, or SDL creates a tiny window.
    canvas.id = 'canvas';
    canvas.width = BLASTEM_VIDEO.width;
    canvas.height = BLASTEM_VIDEO.height;
    canvas.tabIndex = 0;
    canvas.style.border = '0';
    canvas.style.padding = '0';
    canvas.style.display = 'block';
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    void this.#applyFilter();

    if (this.#box && this.#ownsCanvas) {
      this.#boxObserver?.disconnect();
      this.#boxObserver = new ResizeObserver(() => this.#fit());
      this.#boxObserver.observe(this.#box);
      this.#fit();
    }
  }

  protected override async open(_options: BlastemOptions): Promise<void> {
    if (this.#destroyed) {
      throw new Error('blastem: this engine has been destroyed and cannot be started again in this page — build a new BlastemSDK in a new page');
    }
    if (this.#module) {
      // Already running: a restart is BlastEm's soft reset.
      if (this.#pauseOwner) this.resume(this.#pauseOwner);
      this.#module._web_soft_reset();
      return;
    }
    await this.#boot();
  }

  protected override patched(kind: string, patch: object): void {
    if (kind === 'config' && 'renderFilter' in patch) void this.#applyFilter();
  }

  protected override async close(): Promise<void> {
    if (this.#saveTimer) clearInterval(this.#saveTimer);
    this.#saveTimer = null;
    document.removeEventListener('visibilitychange', this.#onHidden);
    window.removeEventListener('pagehide', this.#onHidden);

    const Module = this.#module;
    if (Module) {
      await this.flushSaves();
      try {
        Module._emscripten_pause_main_loop();
      } catch {
        /* already gone */
      }
      try {
        await Module.SDL2?.audioContext?.close();
      } catch {
        /* already closed */
      }
    }
    this.#boxObserver?.disconnect();
    this.#boxObserver = null;
    if (this.#ownsCanvas) this.#canvas?.remove();
    this.#canvas = null;
    this.#module = null;
    this.#pauseOwner = null;
    this.#destroyed = true;
  }

  // ---- Boot ----

  async #boot(): Promise<void> {
    const config = await this.#values<BlastemConfig>('config');
    const assets = await this.#values<{ rom?: BlastemAsset }>('assets');
    const storage = await this.#values<{ namespace?: string; persist?: 'opfs' | null }>('storage');

    if (!this.#canvas) {
      throw new Error('blastem: mount() an element (or a canvas) before start()');
    }

    const rom = await resolveAsset(assets.rom);
    if (!rom) throw new Error('blastem: no ROM — hand one over as assets.rom (bytes or a thunk)');

    const resolved = storagePath(ENGINE_ID, storage.namespace);
    this.#namespace = resolved.namespace;
    this.#storagePath = resolved.path;
    this.#persist = storage.persist !== null;

    const jsUrl = config.jsUrl ?? new URL('./blastem.js', import.meta.url).href;
    const wasmUrl = config.wasmUrl ?? new URL('./blastem.wasm', import.meta.url).href;
    const { default: createBlastem } = (await import(/* @vite-ignore */ jsUrl)) as {
      default: BlastemFactory;
    };

    let failed: ((error: Error) => void) | null = null;
    const Module = await createBlastem({
      canvas: this.#canvas,
      noInitialRun: true,
      locateFile: (path: string) => (path.endsWith('.wasm') ? wasmUrl : new URL(path, jsUrl).href),
      print: (text: string) => console.log('[blastem]', text),
      printErr: (text: string) => console.warn('[blastem]', text),
      onAbort: (what: unknown) => failed?.(new Error(`blastem: aborted — ${String(what)}`)),
    });
    this.#module = Module;
    failed = (error) => this.emit('error', error);

    const { FS } = Module;
    for (const dir of [ROM_DIR, SAVE_DIR]) {
      try {
        FS.mkdir(dir);
      } catch {
        /* exists */
      }
    }
    const name = romName(rom);
    FS.writeFile(`${ROM_DIR}/${name}`, rom);
    if (this.#persist) await this.#restoreSaves();

    const args: string[] = [];
    if (config.region && config.region !== 'auto') args.push('-r', REGION_FLAG[config.region]);
    args.push(`${ROM_DIR}/${name}`, String(BLASTEM_VIDEO.width), String(BLASTEM_VIDEO.height));
    Module.callMain(args);

    if (this.#persist) {
      this.#saveTimer = setInterval(() => void this.flushSaves(), SAVE_INTERVAL_MS);
      document.addEventListener('visibilitychange', this.#onHidden);
      window.addEventListener('pagehide', this.#onHidden);
    }
    this.#fit();
  }

  /** The plain values behind one payload's descriptors. */
  async #values<T>(kind: 'config' | 'assets' | 'storage'): Promise<T> {
    const described = (await this[kind]()) as Record<string, { value: unknown }>;
    const out: Record<string, unknown> = {};
    for (const [key, property] of Object.entries(described)) out[key] = property.value;
    return out as T;
  }

  // ---- Saves ----

  async #restoreSaves(): Promise<void> {
    const dir = await opfsDir(this.#storagePath, false);
    if (!dir || !this.#module) return;
    const iterable = dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> };
    for await (const [name, handle] of iterable.entries()) {
      if (handle.kind !== 'file') continue;
      const bytes = new Uint8Array(await (await (handle as FileSystemFileHandle).getFile()).arrayBuffer());
      this.#module.FS.writeFile(`${SAVE_DIR}/${name}`, bytes);
      this.#lastSaved.set(name, bytes);
    }
  }

  async #flush(): Promise<void> {
    const Module = this.#module;
    if (!Module || !this.#persist) return;
    try {
      Module._web_persist_save();
    } catch (e) {
      console.warn('[blastem] persist_save failed', e);
      return;
    }
    const changed: Array<[string, Uint8Array<ArrayBuffer>]> = [];
    for (const name of Module.FS.readdir(SAVE_DIR)) {
      if (name === '.' || name === '..') continue;
      const path = `${SAVE_DIR}/${name}`;
      if (!Module.FS.isFile(Module.FS.stat(path).mode)) continue;
      const bytes = new Uint8Array(Module.FS.readFile(path));
      if (!sameBytes(this.#lastSaved.get(name), bytes)) changed.push([name, bytes]);
    }
    if (changed.length === 0) return;

    const dir = await opfsDir(this.#storagePath, true);
    if (!dir) return;
    const written: string[] = [];
    for (const [name, bytes] of changed) {
      try {
        const writable = await (await dir.getFileHandle(name, { create: true })).createWritable();
        await writable.write(bytes);
        await writable.close();
        this.#lastSaved.set(name, bytes);
        written.push(name);
      } catch (e) {
        console.warn(`[blastem] could not persist ${name}`, e);
      }
    }
    if (written.length) this.emit('saves', { files: written });
  }

  // ---- Picture ----

  #fit(): void {
    const canvas = this.#canvas;
    const box = this.#box;
    if (!canvas || !box || !this.#ownsCanvas) return;
    const { width, height } = box.getBoundingClientRect();
    if (!width || !height) return;
    const scale = Math.min(width / BLASTEM_VIDEO.width, height / BLASTEM_VIDEO.height);
    canvas.style.width = `${Math.floor(BLASTEM_VIDEO.width * scale)}px`;
    canvas.style.height = `${Math.floor(BLASTEM_VIDEO.height * scale)}px`;
  }

  async #applyFilter(): Promise<void> {
    const canvas = this.#canvas;
    if (!canvas) return;
    const { renderFilter } = await this.#values<BlastemConfig>('config');
    canvas.style.imageRendering = renderFilter === 'smooth' ? 'auto' : 'pixelated';
  }
}

/**
 * The factory a host constructs: static identity, the configuration chain, and a
 * `start()` that boots BlastEm and opens a session.
 */
export class BlastemSDK extends EngineSDKBase<BlastemPayloads> {
  static readonly id = ENGINE_ID;
  /** Kept in step with package.json by `node scripts/sync-version.mjs`. */
  static readonly version = '0.2.0';
  static readonly name = 'BlastEm';
  static readonly description =
    'BlastEm, the Sega Mega Drive / Genesis emulator by Michael Pavone, compiled to WebAssembly. Ships no games: the player provides the ROM, and it never leaves their browser.';

  protected override createPlay(
    init: EngineInit<BlastemPayloads>,
    events: EventEmitter<EventsOf<BlastemPayloads>>,
  ): BlastemPlay {
    return new BlastemPlay(init, events);
  }
}

/** CI's conformance line: if this class stops satisfying the contract, `make test` fails. */
export const BLASTEM_ENGINE: EngineSDKConstructor<BlastemPayloads> = BlastemSDK;

export default BlastemSDK;
