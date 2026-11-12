// The engine owns its folder: every namespace resolves under blastem/, and none can
// climb out of it. Runs against the built SDK (make build-sdk), the module a host
// actually imports — which also proves it loads with no import map or bundler.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import BlastemSDK, { storagePath } from '../dist/blastem/blastem.sdk.js';

const cases = [
  [undefined, 'default', 'blastem/default', false],
  ['', 'default', 'blastem/default', false],
  [{ id: 'sonic-1' }, 'default', 'blastem/default', false],
  ['sonic-1', 'sonic-1', 'blastem/sonic-1', false],
  ['sonic-2/profile-a', 'sonic-2/profile-a', 'blastem/sonic-2/profile-a', false],
  [' a b /c? ', 'a_b/c_', 'blastem/a_b/c_', false],
  ['../x', 'x', 'blastem/x', false],
  ['./../../etc', 'etc', 'blastem/etc', false],
  ['..', 'default', 'blastem/default', false],
  ['/abs/path', 'abs/path', 'blastem/abs/path', false],
  // the old convention: the prefix is stripped once, so the files stay where they were
  ['blastem/Sonic1', 'Sonic1', 'blastem/Sonic1', true],
  // a game literally named like the engine is not mistaken for the prefix
  ['blastem', 'blastem', 'blastem/blastem', false],
];

for (const [input, namespace, path, prefixed] of cases) {
  test(`storagePath('blastem', ${JSON.stringify(input)}) → ${path}`, () => {
    assert.deepEqual(storagePath('blastem', input), { namespace, path, prefixed });
  });
}

test('the engine id is the folder', () => {
  assert.equal(BlastemSDK.id, 'blastem');
  assert.ok(storagePath(BlastemSDK.id, 'x').path.startsWith(`${BlastemSDK.id}/`));
});

test('the spec says what a host needs to paint its settings', async () => {
  const { BLASTEM_SPEC } = await import('../dist/blastem/blastem.sdk.js');
  assert.deepEqual(BLASTEM_SPEC.assets.rom.allowedTypes, ['.bin', '.gen', '.md', '.smd']);
  assert.equal(BLASTEM_SPEC.config.region.default, 'auto');
  assert.equal(BLASTEM_SPEC.storage.namespace.default, 'default');
});
