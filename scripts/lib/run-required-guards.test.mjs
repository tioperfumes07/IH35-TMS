import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runRequiredGuards, reportedSkip, formatLocalOutcomes } from './run-required-guards.mjs';
import { CI_DATABASE_GUARDS, localDatabaseGuardArgs } from './local-db-guard-routing.mjs';
import { classify as classifyStatic, STATIC_RESULT_CATEGORIES } from '../verify-static.mjs';
import { runStep } from '../branch-precheck-push.mjs';

test('gate prerequisite failures remain visible even when no child guard has failed', () => {
  const line = formatLocalOutcomes('gate', { passed: 12, failed: 0, skipped: 3 }, 61, 1);
  assert.match(line, /passed=12 failed=0 skipped=64 gate_exit=1/);
  assert.match(line, /NOT live passes/);
});

test('push precheck prints child skip counts even when the child exits zero', () => {
  const output = [];
  const originalLog = console.log;
  console.log = (...args) => output.push(args.join(' '));
  try {
    const line = 'money-pr-local-gate: LOCAL PHASE OUTCOMES passed=12 failed=0 skipped=64';
    const command = `${JSON.stringify(process.execPath)} -e ${JSON.stringify(`console.log(${JSON.stringify(line)})`)}`;
    const result = runStep(command, 'outcome-fixture', process.cwd());
    assert.equal(result.ok, true);
    assert.ok(output.includes(line), 'an exit-zero child must not hide its 64 skips');
  } finally {
    console.log = originalLog;
  }
});

test('static fallback uses the same required-CI registry and never counts deferral as PASS', () => {
  for (const file of Object.keys(CI_DATABASE_GUARDS)) {
    const result = classifyStatic(path.resolve(file));
    assert.equal(result.kind, STATIC_RESULT_CATEGORIES.SKIP_CAPABILITY, `${file}: ${result.detail}`);
    assert.match(result.detail, /required-live-load-guard/);
  }
});

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

test('exit-zero skips fail required CI and are never counted as passes', () => {
  for (const text of ['SKIP live — no DATABASE_URL', 'guard: SKIPPED — NOT FED YET', '  EMPTY BY PURGE', 'guard: DEFERRED', 'parity scope: 0 of 34 documents in scope, 34 skipped NOT FED YET', 'passed=2 failed=0 skipped=1', '{"passed":2,"skipped":1}']) {
    assert.equal(reportedSkip(text), true, text);
    const result = runRequiredGuards(['a', 'b'], (_node, [file]) => ({ status: 0, stdout: file === 'a' ? text : 'PASS b' }));
    assert.equal(result.length, 1);
    assert.deepEqual(result.summary, { attempted: 2, executed: 2, passed: 1, failed: 0, skipped: 1 });
  }
  assert.equal(reportedSkip('passed=2 failed=0 skipped=0'), false);
  assert.equal(reportedSkip('guard: NO STATIC ASSERTION — required in CI'), true);
  assert.equal(reportedSkip('PASS — rejects a skip mutation'), false);
});

test('actual CLI rejects an exit-zero skip even with a database credential present', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ih35-required-skip-'));
  try {
    const file = path.join(dir, 'skipped.mjs');
    fs.writeFileSync(file, 'console.log("fixture: SKIP live — absent population"); process.exit(0);');
    const result = spawnSync(process.execPath, ['scripts/lib/run-required-guards.mjs', file], {
      encoding: 'utf8', env: { ...process.env, DATABASE_URL: 'synthetic-not-used-by-this-fixture' },
    });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /executed=1 passed=0 failed=0 skipped=1/);
    assert.match(result.stderr, /REQUIRED CI SKIP IS A FAILURE/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
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
        .replaceAll('${{ needs.required-live-load-guard.result }}', 'success')
        .replaceAll('${{ needs.required-static-guards.result }}', status);
      const result = spawnSync('bash', ['-c', script]);
      assert.equal(result.status, status === 'success' ? 0 : 1, `${doc}/${status}`);
    }
  }
});

test('live phase is required even for doc-only changes; no DB remains a live failure', () => {
  const source = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
  const aggregate = source.split('\n  build-typecheck:\n')[1];
  assert.match(aggregate, /needs: \[[^\n]*required-live-load-guard/);
  for (const status of ['failure', 'skipped', 'cancelled']) {
    const script = aggregate.split('run: |\n')[1].split('\n').map(line => line.replace(/^          /, '')).join('\n')
      .replaceAll('${{ needs.detect-scope.outputs.doc_only }}', 'true')
      .replaceAll('${{ needs.build-typecheck-heavy.result }}', 'skipped')
      .replaceAll('${{ needs.required-static-guards.result }}', 'success')
      .replaceAll('${{ needs.required-live-load-guard.result }}', status);
    assert.equal(spawnSync('bash', ['-c', script]).status, 1);
  }
  const env = { ...process.env };
  delete env.DATABASE_URL;
  delete env.DATABASE_DIRECT_URL;
  const args = ['scripts/verify-one-load-create-path.mjs'];
  assert.equal(spawnSync(process.execPath, [...args, '--static'], { env }).status, 0);
  assert.equal(spawnSync(process.execPath, args, { env }).status, 1);
});

test('every locally routed guard has a real required live-job invocation, never an empty-DB substitute', () => {
  const source = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
  const live = source.split('\n  required-live-load-guard:\n')[1].split('\n  verify-branch-fresh:')[0];
  assert.match(live, /secrets\.PROD_READONLY_DATABASE_URL/);
  assert.match(live, /default_transaction_read_only=on/);
  assert.doesNotMatch(live, /continue-on-error|--static|--selftest|localhost/);
  for (const [file, mode] of Object.entries(CI_DATABASE_GUARDS)) {
    assert.ok(live.includes(file), `missing live invocation: ${file}`);
    assert.deepEqual(localDatabaseGuardArgs([file]), mode ? [file, mode] : null);
    assert.deepEqual(localDatabaseGuardArgs([file, '--selftest']), mode === null ? null : [file, '--selftest']);
  }
  assert.deepEqual(localDatabaseGuardArgs(['scripts/unreviewed.mjs']), ['scripts/unreviewed.mjs']);
});

test('static domain guards run without credentials; unknown live domains still fail closed', async () => {
  const { requiresLocalDatabase, STATIC_DOMAIN_GUARDS } = await import('./local-db-guard-routing.mjs');
  for (const file of STATIC_DOMAIN_GUARDS) {
    assert.equal(requiresLocalDatabase(file), false);
    assert.deepEqual(localDatabaseGuardArgs([file]), [file], 'must still execute the actual static assertion');
  }
  for (const file of Object.keys(CI_DATABASE_GUARDS)) assert.equal(requiresLocalDatabase(file), false);
  assert.equal(requiresLocalDatabase('scripts/verify-unreviewed-live.mjs'), true);
  const gate = fs.readFileSync('scripts/money-pr-local-gate.mjs', 'utf8');
  assert.match(gate, /!process\.env\.DATABASE_URL && requiresLocalDatabase\(rel\)/);
  assert.match(gate, /const code = needsWriterUrl[\s\S]*?runNode\(rel\)/);
});
