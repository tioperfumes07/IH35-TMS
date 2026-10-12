#!/usr/bin/env node
/** @matrix-built modules=settlements,accounting cols=connectivity task=NB-OPEN-TOUR-SPLIT */
// 443.97: the static decisions are pure functions shared by the normal run and --selftest; the normal run still runs the
// two vitest suites. --selftest plants each invariant's violation in memory (no database, no vitest).
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));

export const EVIDENCE_REQUIRED = ["'identity_only',NULL", 'FOR UPDATE OF r, je', 'Historical source changed since review',
  'Historical targets must be unused settlement identities', 'Historical round trips require distinct target settlements',
  'to_jsonb(p) AS snapshot', 'to_jsonb(sl) AS snapshot', 'to_jsonb(d) AS snapshot',
  'to_jsonb(r) AS snapshot FROM driver_finance.driver_reimbursements', 'Historical attribution idempotency conflict'];
export const PROCESSING_FILES = ['settlement-payrun-claim.service.ts', 'settlement-payrun-close.service.ts', 'settlement-payrun-reverse.service.ts',
  'settlement-continuation.service.ts', 'settlement-payment.service.ts', 'settlements-load-bookended.service.ts', 'negative-settlement-liability.service.ts'];
export const JOURNAL_FILES = ['journal-entries.service.ts', 'void.service.ts'];

export function assertEvidence(source) {
  for (const required of EVIDENCE_REQUIRED) {
    if (!source.includes(required)) throw new Error('Historical attribution invariant missing: ' + required);
  }
  if (/\b(?:UPDATE|DELETE FROM)\s+(?:accounting|driver_finance|mdata)\./.test(source)) {
    throw new Error('Identity attribution must not rewrite original financial records');
  }
}

/** Throws the first wiring violation: processing / journal protection, detail + finalize wiring. */
export function assertWiring({ processing, journals, routes }) {
  for (const [file, code] of Object.entries(processing)) {
    if (!code.includes('await assertNoHistoricalSettlementCoverage(')) throw new Error(file + ' lacks historical processing protection');
  }
  for (const [file, code] of Object.entries(journals)) {
    if (!code.includes('await assertNoHistoricalJournalCoverage(')) throw new Error(file + ' can reverse covered historical journals');
  }
  if (!routes.includes('historical_attributions: await readHistoricalSettlementAttributions(') ||
      !routes.split('settlements/:id/finalize')[1]?.includes('await assertNoHistoricalSettlementCoverage(')) throw new Error('Historical detail/finalize wiring missing');
}

const throws = (fn) => { try { fn(); return false; } catch { return true; } };

function loadSources() {
  const service = readFileSync(root + 'apps/backend/src/driver-finance/settlement-historical-attribution.service.ts', 'utf8');
  const processing = Object.fromEntries(PROCESSING_FILES.map((f) => [f, readFileSync(root + 'apps/backend/src/driver-finance/' + f, 'utf8')]));
  const journals = Object.fromEntries(JOURNAL_FILES.map((f) => [f, readFileSync(root + 'apps/backend/src/accounting/' + f, 'utf8')]));
  const routes = readFileSync(root + 'apps/backend/src/driver-finance/settlements.routes.ts', 'utf8');
  return { service, processing, journals, routes };
}

if (process.argv.includes('--selftest')) {
  const src = loadSources();
  const firstProc = PROCESSING_FILES[0];
  const cases = [
    ['the real service passes the evidence invariants', !throws(() => assertEvidence(src.service))],
    ['the real wiring passes', !throws(() => assertWiring(src))],
    ['a zero allocation (identity_only,0) is caught', throws(() => assertEvidence(src.service.replace("'identity_only',NULL", "'identity_only',0")))],
    ['a journal race (FOR UPDATE OF r only) is caught', throws(() => assertEvidence(src.service.replace('FOR UPDATE OF r, je', 'FOR UPDATE OF r')))],
    ['a rewrite of an original financial record is caught', throws(() => assertEvidence(src.service + '\nUPDATE accounting.journal_entries SET memo = 1'))],
    ['a processing path without historical protection is caught', throws(() => assertWiring({ ...src, processing: { ...src.processing,
      [firstProc]: src.processing[firstProc].split('await assertNoHistoricalSettlementCoverage(').join('void (') } }))],
    ['a journal reversal path without coverage protection is caught', throws(() => assertWiring({ ...src, journals: { ...src.journals,
      'void.service.ts': src.journals['void.service.ts'].split('await assertNoHistoricalJournalCoverage(').join('void (') } }))],
    ['finalize without the coverage check is caught', throws(() => assertWiring({ ...src, routes: src.routes.split('settlements/:id/finalize')[0] }))],
  ];
  for (const [n, p] of cases) console.log(`  ${p ? '✓' : '✗'} ${n}`);
  const bad = cases.filter(([, p]) => !p).length;
  console.log(bad ? 'verify-settlement-historical-attribution --selftest FAIL' : `verify-settlement-historical-attribution --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

const src = loadSources();
assertEvidence(src.service);
for (const broken of [src.service.replace("'identity_only',NULL", "'identity_only',0"), src.service.replace('FOR UPDATE OF r, je', 'FOR UPDATE OF r')]) {
  let caught = false;
  try { assertEvidence(broken); } catch { caught = true; }
  if (!caught) throw new Error('Historical zero-allocation/journal-race mutation escaped');
}
assertWiring(src);
for (const [cwd, config, file] of [
  [root, 'apps/backend/vitest.config.ts', 'apps/backend/src/driver-finance/__tests__/settlement-historical-attribution.test.ts'],
  [root + 'apps/frontend', 'apps/frontend/vitest.config.ts', 'src/components/driver-finance/__tests__/HistoricalSettlementAttributions.test.tsx'],
]) {
  const result = spawnSync(process.execPath, [root + 'node_modules/vitest/vitest.mjs', 'run', '--config', root + config, file],
    { cwd, stdio: 'inherit', timeout: 120000 });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log('verify-settlement-historical-attribution PASS: original evidence, NULL allocation, distinct ownership and processing protection');
