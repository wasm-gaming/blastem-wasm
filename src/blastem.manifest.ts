import type { EngineManifest } from '@wasm-gaming/engine-specs';
import { BLASTEM_OPTIONS_SCHEMA } from './blastem.options.js';

export const manifest: EngineManifest = {
  id: 'blastem',
  version: '0.1.0',
  name: 'BlastEm (WebAssembly)',
  artifacts: {
    wasm: 'blastem/blastem.wasm',
    js: 'blastem/blastem.js',
  },
  assets: [
    {
      key: 'rom',
      mountPath: '/rom/game.bin',
      required: true,
      accept: ['.bin', '.gen', '.md', '.smd'],
      description: 'Mega Drive ROM bytes written to Emscripten MEMFS before boot.',
    },
  ],
  input: 'blastem',
  video: { baseWidth: 320, baseHeight: 224, aspect: '4:3' },
  options: BLASTEM_OPTIONS_SCHEMA,
  capabilities: { saveStates: false, sram: false, coreSelectable: false },
};

export default manifest;
