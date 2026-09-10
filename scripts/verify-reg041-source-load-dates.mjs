#!/usr/bin/env node
// REG-041: prove source-load dates through the scoped reader and real rendered Resettlement row.
/** @matrix-built modules=accounting,settlements cols=connectivity task=REG-041 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const source = readFileSync(root + 'apps/backend/src/accounting/load-costs-board.routes.ts', 'utf8');
for (const expected of [
  'pickup.scheduled_arrival_at::text AS pickup_date',
  'delivery.actual_arrival_at::text AS actual_delivery_at',
  "load_id=l.id AND stop_type='pickup' AND soft_deleted_at IS NULL ORDER BY sequence_number ASC",
  "load_id=l.id AND stop_type='delivery' AND soft_deleted_at IS NULL ORDER BY sequence_number DESC",
  'WHERE l.operating_company_id=$1::uuid',
]) if (!source.includes(expected)) throw new Error('Source-load date wiring missing: ' + expected);
const result = spawnSync(process.execPath, [root + 'node_modules/vitest/vitest.mjs', 'run', '--config', root + 'apps/frontend/vitest.config.ts', 'src/pages/accounting/LoadCostsBoardPage.registers.test.tsx', '-t', 'REG-041'], { cwd: root + 'apps/frontend', stdio: 'inherit', timeout: 120000 });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log('verify-reg041-source-load-dates PASS');
