import type { EngineConfig, EngineEvent, EngineInstance } from '@wasm-gaming/engine-specs';
import { manifest } from './blastem.manifest.js';
import { DEFAULT_BLASTEM_OPTIONS, type BlastemOptions } from './blastem.options.js';

export { manifest };

/** Shape of the Emscripten Module object exposed by blastem.js */
type BlastemModule = {
  // BlastEm's Emscripten build does not export the full `FS` object
  // (no -sEXPORTED_RUNTIME_METHODS=FS), only the legacy FS_* helpers.
  FS_createPath(parent: string, path: string, canRead: boolean, canWrite: boolean): void;
  FS_createDataFile(
    parent: string,
    name: string,
    data: Uint8Array,
    canRead: boolean,
    canWrite: boolean,
    canOwn?: boolean,
  ): void;
  callMain(args: string[]): void;
  onRuntimeInitialized?: () => void;
  locateFile?: (path: string, prefix: string) => string;
  noInitialRun?: boolean;
  canvas: HTMLCanvasElement;
};

type BlastemModuleFactory = (overrides: Partial<BlastemModule>) => Promise<BlastemModule>;

const scriptLoadCache = new Map<string, Promise<void>>();

function loadClassicScriptOnce(src: string): Promise<void> {
  const cached = scriptLoadCache.get(src);
  if (cached) return cached;

  const p = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`blastem: failed to load script: ${src}`));
    document.head.appendChild(script);
  });

  scriptLoadCache.set(src, p);
  return p;
}

export type BlastemLoadConfig = EngineConfig & {
  /** Override the URL of blastem.js (defaults to `./blastem.js` relative to the SDK). */
  jsUrl?: string;
};

/**
 * Ensure the canvas used by BlastEm has `id="canvas"`.
 * Emscripten SDL2 queries `document.querySelector('#canvas')` to locate its render target.
 */
function prepareCanvas(
  canvas: HTMLCanvasElement,
  renderFilter: Required<BlastemOptions>['renderFilter'],
): HTMLCanvasElement {
  if (canvas.id !== 'canvas') {
    // Clone or alias — prefer aliasing so the caller's reference remains valid.
    canvas.id = 'canvas';
  }
  // Emscripten SDL2 reads getBoundingClientRect(); ensure it has layout dimensions.
  if (!canvas.width) canvas.width = 640;
  if (!canvas.height) canvas.height = 480;
  // SDL2's Emscripten backend shrinks the canvas to 1x1 and measures
  // getBoundingClientRect() to detect external CSS sizing. Borders/padding are
  // included in that rect, so decoration on the canvas itself makes SDL create
  // a tiny (e.g. 5x5) window. Host pages should decorate a wrapper instead.
  canvas.style.border = '0';
  canvas.style.padding = '0';

  if (renderFilter === 'pixelated') {
    // Keep retro pixels crisp when CSS scales the output.
    canvas.style.imageRendering = 'pixelated';
    if (!canvas.style.imageRendering) {
      // Fallback for older engines.
      canvas.style.imageRendering = 'crisp-edges';
    }
  } else {
    canvas.style.imageRendering = 'auto';
  }

  return canvas;
}

function toUint8(x: unknown): Uint8Array | null {
  if (x == null) return null;
  if (typeof x === 'string') return new TextEncoder().encode(x);
  if (x instanceof Uint8Array) return x;
  if (x instanceof ArrayBuffer) return new Uint8Array(x);
  if (ArrayBuffer.isView(x)) return new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
  throw new TypeError('asset must be Uint8Array | ArrayBuffer | string');
}

export async function load(config: BlastemLoadConfig): Promise<EngineInstance> {
  const { canvas, assets, onEvent } = config;
  if (!canvas) throw new Error('blastem: config.canvas is required');

  const emit = (e: EngineEvent): void => {
    try {
      onEvent?.(e);
    } catch {
      // host callback must not break the engine runtime
    }
  };

  const opts: Required<BlastemOptions> = {
    ...DEFAULT_BLASTEM_OPTIONS,
    ...(config.options as BlastemOptions | undefined),
  };

  const romBytes = toUint8(assets?.rom ?? assets?.data);
  if (!romBytes) {
    throw new Error('blastem: no ROM bytes provided — pass assets.rom');
  }

  prepareCanvas(canvas, opts.renderFilter);

  const jsUrl = config.jsUrl ?? new URL('./blastem.js', import.meta.url).href;
  const wasmUrl = new URL('./blastem.wasm', jsUrl).href;

  let modRef: BlastemModule | null = null;
  let readyResolve: (() => void) | null = null;
  const readyPromise = new Promise<void>((resolve) => {
    readyResolve = resolve;
  });

  const moduleOverrides: Partial<BlastemModule> = {
    canvas,
    noInitialRun: true,
    locateFile(path: string): string {
      if (path.endsWith('.wasm')) return wasmUrl;
      return new URL(path, jsUrl).href;
    },
    onRuntimeInitialized() {
      const mod = modRef ?? ((globalThis as { Module?: BlastemModule }).Module ?? null);
      if (!mod) return;
      // Write ROM into MEMFS before callMain so BlastEm can open it.
      try {
        mod.FS_createPath('/', 'rom', true, true);
      } catch {
        // /rom may already exist
      }
      mod.FS_createDataFile('/rom', opts.romFileName, romBytes, true, true, true);
      readyResolve?.();
    },
  };

  // Some BlastEm builds are classic scripts (global Module), others expose a global factory.
  (globalThis as { Module?: Partial<BlastemModule> }).Module = moduleOverrides;
  await loadClassicScriptOnce(jsUrl);

  const g = globalThis as {
    createBlastemModule?: BlastemModuleFactory;
    Module?: BlastemModule;
  };

  if (typeof g.createBlastemModule === 'function') {
    modRef = await g.createBlastemModule(moduleOverrides);
  } else if (g.Module) {
    modRef = g.Module;
  } else {
    throw new Error('blastem: unable to initialize runtime module from blastem.js');
  }

  await readyPromise;

  // Boot the emulator pointing at the ROM path.
  modRef.callMain([`/rom/${opts.romFileName}`]);

  emit({ type: 'ready' });

  return {
    start() {
      // BlastEm starts automatically after callMain().
    },
    pause() {
      // No pause API exposed by the Emscripten build.
    },
    resume() {
      // No pause API exposed by the Emscripten build.
    },
    reset() {
      // BlastEm does not expose a reset hook via the WASM API.
    },
    setInput(_map) {
      // Input is handled by Emscripten SDL2 event loop; no external override needed.
    },
    destroy() {
      // No shutdown hook in the Emscripten module.
    },
  };
}

export default { manifest, load };
