#!/usr/bin/env node
// REG-040: exercise real board rendering and same-tour booking inheritance without live fixtures.
/** @matrix-built modules=accounting,settlements cols=connectivity task=REG-040 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const booking = readFileSync(root + 'apps/backend/src/dispatch/book-load.service.ts', 'utf8');
export function bookingHandsTourToSettlement(code) {
  return /resolvedTourId = tourId/.test(code) && /linkLoadToPresettlementAtBookingInClientTx\(client,\s*\{[^}]*tour_id: resolvedTourId/.test(code);
}
const SUITES = [
  [root, 'apps/backend/vitest.config.ts', 'apps/backend/src/dispatch/__tests__/presettlement-link.service.test.ts'],
  [root, 'apps/backend/vitest.config.ts', 'apps/backend/src/driver-finance/__tests__/settlement-continuation.test.ts'],
  [root, 'apps/backend/vitest.config.ts', 'apps/backend/src/driver-finance/__tests__/settlement-payrun-recovery.test.ts'],
  [root, 'apps/backend/vitest.config.ts', 'apps/backend/src/accounting/__tests__/company-settlement-close.service.test.ts'],
  [root, 'apps/backend/vitest.config.ts', 'apps/backend/src/accounting/__tests__/load-costs-margin-sort.test.ts'],
  [root + 'apps/frontend', 'apps/frontend/vitest.config.ts', 'src/pages/accounting/LoadCostsBoardPage.registers.test.tsx'],
];
/** First non-zero suite status, or 0 — a red suite must fail the guard. */
export function firstFailingStatus(suites, run) {
  for (const suite of suites) {
    const result = run(suite);
    if (result.error) throw result.error;
    if (result.status !== 0) return result.status ?? 1;
  }
  return 0;
}
if (process.argv.includes("--selftest")) {
  const planted = [
    ['tour id dropped at booking', !bookingHandsTourToSettlement(booking.replace(/resolvedTourId = tourId/g, 'resolvedTourId = null'))],
    ['settlement link not given the tour', !bookingHandsTourToSettlement(booking.replace(/tour_id: resolvedTourId/g, 'tour_id: null'))],
    ['red suite swallowed', firstFailingStatus(SUITES, (s) => ({ status: s === SUITES[3] ? 1 : 0 })) === 1],
    ['killed suite swallowed', firstFailingStatus(SUITES, () => ({ status: null })) === 1],
  ];
  const caught = planted.filter(([, ok]) => ok).length;
  for (const [name, ok] of planted) if (!ok) console.error('verify-reg040-resettlement SELFTEST: escaped — ' + name);
  const clean = bookingHandsTourToSettlement(booking) && firstFailingStatus(SUITES, () => ({ status: 0 })) === 0;
  console.log(`verify-reg040-resettlement SELFTEST: ${caught}/${planted.length} planted violations caught${clean ? '' : ' — CLEAN INPUT FLAGGED'}`);
  process.exit(caught === planted.length && clean ? 0 : 1);
}
if (!bookingHandsTourToSettlement(booking)) {
  throw new Error('Booking must hand the persisted tour ID to settlement inheritance');
}
const status = firstFailingStatus(SUITES, ([cwd, config, file]) =>
  spawnSync(process.execPath, [root + 'node_modules/vitest/vitest.mjs', 'run', '--config', root + config, file], { cwd, stdio: 'inherit', timeout: 120000 }));
if (status !== 0) process.exit(status);
console.log('verify-reg040-resettlement PASS');
