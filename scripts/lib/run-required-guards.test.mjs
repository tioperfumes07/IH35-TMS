import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { runRequiredGuards } from './run-required-guards.mjs';

test('every failed position fails the batch without skipping later checks', () => {
  const files = Array.from({ length: 10 }, (_, i) => `guard-${i}`);
  for (let bad = 0; bad < files.length; bad++) {
    const seen = [];
    const failures = runRequiredGuards(files, (_node, [file]) => {
      seen.push(file);
      return { status: file === files[bad] ? 1 : 0 };
    });
    assert.deepEqual(seen, files);
    assert.equal(failures.length, 1);
    assert.equal(failures[0].file, files[bad]);
  }
});

test('signals, spawn errors, throws, and missing exit codes fail closed', () => {
  for (const result of [{ signal: 'SIGTERM', status: null }, { error: new Error('ENOENT') }, {}, { status: undefined }]) {
    assert.equal(runRequiredGuards(['a'], () => result).length, 1);
  }
  assert.equal(runRequiredGuards(['a'], () => { throw new Error('spawn failed'); }).length, 1);
  assert.deepEqual(runRequiredGuards(['a'], () => ({ status: 0 })), []);
  assert.throws(() => runRequiredGuards([]));
  assert.throws(() => runRequiredGuards(['a', 'a']));
});

test('actual CLI exits nonzero on an unstartable guard', () => {
  const result = spawnSync(process.execPath, ['scripts/lib/run-required-guards.mjs', 'scripts/no-such-required-guard.mjs'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /executed=1 passed=0 failed=1/);
});

test('required CI aggregate rejects failed, skipped, or cancelled static job, including docs-only PRs', () => {
  const workflow = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
  const aggregate = workflow.split('\n  build-typecheck:\n')[1];
  assert.match(aggregate, /needs: \[[^\n]*required-static-guards/);
  const batch = workflow.split('\n  required-static-guards:\n')[1].split('\n  verify-branch-fresh:')[0];
  assert.doesNotMatch(batch, /continue-on-error:|^    if:/m);
  assert.match(batch, /node --test scripts\/lib\/run-required-guards.test.mjs/);
  const aggregateScript = aggregate.split('run: |\n')[1].split('\n').map(line => line.replace(/^          /, '')).join('\n');
  for (const doc of ['true', 'false']) {
    for (const status of ['success', 'failure', 'skipped', 'cancelled']) {
      const script = aggregateScript
        .replaceAll('${{ needs.detect-scope.outputs.doc_only }}', doc)
        .replaceAll('${{ needs.build-typecheck-heavy.result }}', 'success')
        .replaceAll('${{ needs.required-static-guards.result }}', status);
      const result = spawnSync('bash', ['-c', script]);
      assert.equal(result.status, status === 'success' ? 0 : 1, `${doc}/${status}`);
    }
  }
});
