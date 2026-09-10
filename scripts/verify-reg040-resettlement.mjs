#!/usr/bin/env node
// REG-040: exercise real board rendering and same-tour booking inheritance without live fixtures.
/** @matrix-built modules=accounting,settlements cols=connectivity task=REG-040 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const booking = readFileSync(root + 'apps/backend/src/dispatch/book-load.service.ts', 'utf8');
if (!/resolvedTourId = tourId/.test(booking) || !/linkLoadToPresettlementAtBookingInClientTx\(client,\s*\{[^}]*tour_id: resolvedTourId/.test(booking)) {
  throw new Error('Booking must hand the persisted tour ID to settlement inheritance');
}
for (const [cwd, config, file] of [
  [root, 'apps/backend/vitest.config.ts', 'apps/backend/src/dispatch/__tests__/presettlement-link.service.test.ts'],
  [root + 'apps/frontend', 'apps/frontend/vitest.config.ts', 'src/pages/accounting/LoadCostsBoardPage.registers.test.tsx'],
]) {
  const result = spawnSync(process.execPath, [root + 'node_modules/vitest/vitest.mjs', 'run', '--config', root + config, file], { cwd, stdio: 'inherit', timeout: 120000 });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log('verify-reg040-resettlement PASS');
