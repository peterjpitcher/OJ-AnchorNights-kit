// From Cash Bingo (src/lib/build-check.test.ts), on Vitest: the generic
// cases. Cash Bingo's isPublicReloadSafe cases stay in Cash Bingo.
//
// A pub TV never reloads on its own, so it ran whatever release was live when
// somebody last touched it. The build check lets it pick up a new release, but
// only at a moment when a reload cannot hide a claim check or a win from the
// room, and never on a local build.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { decideBuildAction, isNewBuild, readBuildResponse } from './build-check';

test('the same build does nothing', () => {
  assert.equal(decideBuildAction({ clientBuild: 'abc', serverBuild: 'abc', mode: 'auto', safe: true }), 'none');
  assert.equal(decideBuildAction({ clientBuild: 'abc', serverBuild: 'abc', mode: 'prompt', safe: true }), 'none');
});

test('a dev build never triggers anything, on either side', () => {
  for (const mode of ['auto', 'prompt'] as const) {
    assert.equal(decideBuildAction({ clientBuild: 'dev', serverBuild: 'abc', mode, safe: true }), 'none');
    assert.equal(decideBuildAction({ clientBuild: 'abc', serverBuild: 'dev', mode, safe: true }), 'none');
  }
});

test('an unknown server build does nothing', () => {
  assert.equal(decideBuildAction({ clientBuild: 'abc', serverBuild: null, mode: 'auto', safe: true }), 'none');
  assert.equal(decideBuildAction({ clientBuild: 'abc', serverBuild: '', mode: 'auto', safe: true }), 'none');
});

test('TV and phone reload by themselves when it is safe', () => {
  assert.equal(decideBuildAction({ clientBuild: 'abc', serverBuild: 'def', mode: 'auto', safe: true }), 'reload');
});

test('TV and phone wait during a claim check or a win', () => {
  assert.equal(decideBuildAction({ clientBuild: 'abc', serverBuild: 'def', mode: 'auto', safe: false }), 'wait');
});

test('the host is only ever prompted, never reloaded', () => {
  assert.equal(decideBuildAction({ clientBuild: 'abc', serverBuild: 'def', mode: 'prompt', safe: true }), 'prompt');
});

test('the host prompt waits while a claim is open', () => {
  assert.equal(decideBuildAction({ clientBuild: 'abc', serverBuild: 'def', mode: 'prompt', safe: false }), 'wait');
});

test('isNewBuild agrees with the decision', () => {
  assert.equal(isNewBuild('abc', 'def'), true);
  assert.equal(isNewBuild('abc', 'abc'), false);
  assert.equal(isNewBuild('dev', 'def'), false);
  assert.equal(isNewBuild('abc', 'dev'), false);
  assert.equal(isNewBuild('abc', undefined), false);
});

test('the build route answer is read safely', () => {
  assert.equal(readBuildResponse({ build: 'abc123' }), 'abc123');
  assert.equal(readBuildResponse({ build: '' }), null);
  assert.equal(readBuildResponse({ build: 42 }), null);
  assert.equal(readBuildResponse(null), null);
  assert.equal(readBuildResponse('abc'), null);
});
