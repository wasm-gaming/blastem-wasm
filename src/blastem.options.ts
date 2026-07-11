import type { JSONSchema } from '@wasm-gaming/engine-specs';

export interface BlastemOptions {
  /** ROM filename used when writing bytes to Emscripten MEMFS. */
  romFileName?: string;
  /** Region hint for the emulator (auto-detected if not set). */
  region?: 'auto' | 'us' | 'eu' | 'jp';
}

export const DEFAULT_BLASTEM_OPTIONS: Required<BlastemOptions> = {
  romFileName: 'game.bin',
  region: 'auto',
};

export const BLASTEM_OPTIONS_SCHEMA: JSONSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    romFileName: {
      type: 'string',
      default: 'game.bin',
      description: 'ROM filename written to Emscripten MEMFS when loading a game.',
    },
    region: {
      type: 'string',
      enum: ['auto', 'us', 'eu', 'jp'],
      default: 'auto',
      description: 'Region override for the Mega Drive emulator.',
    },
  },
};
