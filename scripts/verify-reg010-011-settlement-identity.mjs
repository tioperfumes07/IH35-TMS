#!/usr/bin/env node
// REG-010/011: exercise the actual booking allocator and rendered grid column contracts.
// Deliberately database-free: no booking/proof fixtures may be written to production.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));

const OVERRIDE_GUARD = 'scripts/verify-settlement-display-id-override-is-409.mjs';
const suites = [
  ['apps/backend/vitest.config.ts',
    'apps/backend/src/dispatch/__tests__/presettlement-link.service.test.ts',
    'apps/backend/src/driver-finance/__tests__/settlement-number-immutable.test.ts',
    'apps/backend/src/accounting/__tests__/load-costs-margin-sort.test.ts',
    'apps/backend/src/driver-finance/__tests__/settlement-load-bookended.test.ts',
    'apps/backend/src/driver-finance/__tests__/weekly-close.deduction-apply.test.ts'],
  ['apps/frontend/vitest.config.ts',
    'src/pages/driver-finance/reg010-011-settlement-identity.test.tsx',
    'src/components/dispatch/TourPreSettlementTab.test.tsx',
    'src/pages/accounting/LoadCostsBoardPage.registers.test.tsx',
    'src/components/driver-finance/__tests__/PreSettlementsPanel.test.tsx'],
];
/** Every proof this guard names must exist — a renamed/deleted test would otherwise prove nothing. */
export function missingProofFiles(list, exists) {
  const missing = [OVERRIDE_GUARD].filter((f) => !exists(root + f));
  for (const [config, ...files] of list) {
    if (!exists(root + config)) missing.push(config);
    const base = config.includes('frontend') ? root + 'apps/frontend/' : root;
    for (const f of files) if (!exists(base + f)) missing.push(f);
  }
  return missing;
}
/** First non-zero status, or 0 — a red step must fail the guard. */
export function firstFailingStatus(steps, run) {
  for (const step of steps) {
    const result = run(step);
    if (result.error) throw result.error;
    if (result.status !== 0) return result.status ?? 1;
  }
  return 0;
}
if (process.argv.includes("--selftest")) {
  const gone = 'apps/backend/src/driver-finance/__tests__/settlement-number-immutable.test.ts';
  const planted = [
    ['backend proof deleted', missingProofFiles(suites, (f) => !f.endsWith(gone) && existsSync(f)).includes(gone)],
    ['frontend proof deleted', missingProofFiles(suites, (f) => !f.endsWith('reg010-011-settlement-identity.test.tsx') && existsSync(f)).length === 1],
    ['409 override guard deleted', missingProofFiles(suites, (f) => !f.endsWith(OVERRIDE_GUARD) && existsSync(f)).includes(OVERRIDE_GUARD)],
    ['red suite swallowed', firstFailingStatus(suites, (s) => ({ status: s === suites[1] ? 1 : 0 })) === 1],
    ['killed suite swallowed', firstFailingStatus(suites, () => ({ status: null })) === 1],
  ];
  const caught = planted.filter(([, ok]) => ok).length;
  for (const [name, ok] of planted) if (!ok) console.error('verify-reg010-011-settlement-identity SELFTEST: escaped — ' + name);
  const clean = missingProofFiles(suites, existsSync);
  console.log(`verify-reg010-011-settlement-identity SELFTEST: ${caught}/${planted.length} planted violations caught${clean.length ? ' — CLEAN INPUT FLAGGED: ' + clean.join(', ') : ''}`);
  process.exit(caught === planted.length && clean.length === 0 ? 0 : 1);
}
{
  const missing = missingProofFiles(suites, existsSync);
  if (missing.length) {
    console.error('verify-reg010-011-settlement-identity FAIL: named proof missing — ' + missing.join(', '));
    process.exit(1);
  }
}

// ROUND 155.1.b — static lock that typed display_id override is 409, not 404.
{
  const g = spawnSync(process.execPath, [root + OVERRIDE_GUARD], {
    cwd: root, stdio: 'inherit',
  });
  if (g.status !== 0) process.exit(g.status ?? 1);
}

const status = firstFailingStatus(suites, ([config, ...files]) =>
  spawnSync(process.execPath, [root + 'node_modules/vitest/vitest.mjs', 'run', '--config', root + config, ...files], {
    cwd: config.includes('frontend') ? root + 'apps/frontend' : root, stdio: 'inherit', timeout: 120000,
  }));
if (status !== 0) process.exit(status);
console.log('verify-reg010-011-settlement-identity PASS: booking S-YYYY-NNNN and separate grid data');
