// The video settings reach BlastEm through its own config text (default.cfg).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BLASTEM_SPEC, patchConfig, videoEntries } from '../dist/blastem/blastem.sdk.js';

const cfg = `video {
\taspect 4:3
\tvertex_shader default.v.glsl
\tfragment_shader default.f.glsl
\tscanlines off
\tscaling linear
\tntsc {
\t\toverscan {
\t\t\ttop 2
\t\t\t#top 11
\t\t\tbottom 1
\t\t}
\t}
}
audio {
\trate 48000
}
`;

const parse = (text) => {
  // A tiny reader of the same format, for the assertions: path → value.
  const out = {}, stack = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    if (t.endsWith('{')) stack.push(t.slice(0, -1).trim());
    else if (t === '}') stack.pop();
    else { const [k, ...v] = t.split(/\s+/); out[[...stack, k].join('/')] = v.join(' '); }
  }
  return out;
};

test('existing keys change in place, comments stay', () => {
  const out = patchConfig(cfg, [['video/scaling', 'nearest'], ['video/ntsc/overscan/top', '11']]);
  const values = parse(out);
  assert.equal(values['video/scaling'], 'nearest');
  assert.equal(values['video/ntsc/overscan/top'], '11');
  assert.equal(values['video/ntsc/overscan/bottom'], '1');
  assert.match(out, /#top 11/);
  assert.equal(out.split('\n').length, cfg.split('\n').length);
});

test('missing keys and blocks are added inside their parent', () => {
  const values = parse(patchConfig(cfg, [['video/ntsc/overscan/left', '0'], ['video/pal/overscan/top', '30']]));
  assert.equal(values['video/ntsc/overscan/left'], '0');
  assert.equal(values['video/pal/overscan/top'], '30');
  assert.equal(values['audio/rate'], '48000');
});

test('the defaults: sharp pixels and no border', () => {
  const values = Object.fromEntries(videoEntries({}));
  assert.equal(values['video/scaling'], 'nearest');
  assert.equal(values['video/fragment_shader'], 'default.f.glsl');
  assert.equal(values['video/scanlines'], 'off');
  assert.equal(values['video/ntsc/overscan/top'], '11');
  assert.equal(values['video/pal/overscan/bottom'], '24');
  assert.equal(BLASTEM_SPEC.config.border.default, 'hidden');
});

test('each setting value maps to a shader BlastEm ships, and the spec lists them', () => {
  // shaders/ at the pinned upstream revision (scripts/build-blastem.sh), embedded in the wasm.
  const shaders = new Set(['crt.f.glsl', 'crt.v.glsl', 'default.f.glsl', 'default.v.glsl', 'ntsc.f.glsl', 'sharp.f.glsl', 'xBRZ.f.glsl']);
  for (const shader of BLASTEM_SPEC.config.shader.enum) {
    const values = Object.fromEntries(videoEntries({ shader }));
    assert.ok(shaders.has(values['video/fragment_shader']), values['video/fragment_shader']);
    assert.ok(shaders.has(values['video/vertex_shader']), values['video/vertex_shader']);
  }
  assert.equal(BLASTEM_SPEC.config.shader.valueLabels.length, BLASTEM_SPEC.config.shader.enum.length);
  assert.equal(BLASTEM_SPEC.config.border.valueLabels.length, BLASTEM_SPEC.config.border.enum.length);
});

// Upstream's default.cfg, when a local wasm build left it in .tmp/blastem-build/.
const REAL_CFG = '../.tmp/blastem-build/default.cfg';
test('the real default.cfg takes every entry', { skip: !exists(REAL_CFG) }, () => {
  const real = readFileSync(new URL(REAL_CFG, import.meta.url), 'utf8');
  const entries = videoEntries({ shader: 'crt', scanlines: true, border: 'full', renderFilter: 'smooth' });
  const values = parse(patchConfig(real, entries));
  for (const [path, value] of entries) assert.equal(values[path], value, path);
});

function exists(rel) {
  try { readFileSync(new URL(rel, import.meta.url)); return true; } catch { return false; }
}
