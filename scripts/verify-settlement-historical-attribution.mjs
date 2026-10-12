#!/usr/bin/env node
/** @matrix-built modules=settlements,accounting cols=connectivity task=NB-OPEN-TOUR-SPLIT */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const service = readFileSync(root + 'apps/backend/src/driver-finance/settlement-historical-attribution.service.ts', 'utf8');
function assertEvidence(source) {
  for (const required of ["'identity_only',NULL", 'FOR UPDATE OF r, je', 'Historical source changed since review',
    'Historical targets must be unused settlement identities', 'Historical round trips require distinct target settlements',
    'to_jsonb(p) AS snapshot', 'to_jsonb(sl) AS snapshot', 'to_jsonb(d) AS snapshot',
    'to_jsonb(r) AS snapshot FROM driver_finance.driver_reimbursements', 'Historical attribution idempotency conflict']) {
    if (!source.includes(required)) throw new Error('Historical attribution invariant missing: ' + required);
  }
  if (/\b(?:UPDATE|DELETE FROM)\s+(?:accounting|driver_finance|mdata)\./.test(source)) {
    throw new Error('Identity attribution must not rewrite original financial records');
  }
}
assertEvidence(service);
for (const broken of [service.replace("'identity_only',NULL", "'identity_only',0"), service.replace('FOR UPDATE OF r, je', 'FOR UPDATE OF r')]) {
  let caught = false;
  try { assertEvidence(broken); } catch { caught = true; }
  if (!caught) throw new Error('Historical zero-allocation/journal-race mutation escaped');
}
for (const file of ['settlement-payrun-claim.service.ts', 'settlement-payrun-close.service.ts', 'settlement-payrun-reverse.service.ts',
  'settlement-continuation.service.ts', 'settlement-payment.service.ts', 'settlements-load-bookended.service.ts', 'negative-settlement-liability.service.ts']) {
  const code = readFileSync(root + 'apps/backend/src/driver-finance/' + file, 'utf8');
  if (!code.includes('await assertNoHistoricalSettlementCoverage(')) throw new Error(file + ' lacks historical processing protection');
}
for (const file of ['journal-entries.service.ts', 'void.service.ts']) {
  if (!readFileSync(root + 'apps/backend/src/accounting/' + file, 'utf8').includes('await assertNoHistoricalJournalCoverage(')) {
    throw new Error(file + ' can reverse covered historical journals');
  }
}
const routes = readFileSync(root + 'apps/backend/src/driver-finance/settlements.routes.ts', 'utf8');
if (!routes.includes('historical_attributions: await readHistoricalSettlementAttributions(') ||
    !routes.split('settlements/:id/finalize')[1]?.includes('await assertNoHistoricalSettlementCoverage(')) throw new Error('Historical detail/finalize wiring missing');
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
