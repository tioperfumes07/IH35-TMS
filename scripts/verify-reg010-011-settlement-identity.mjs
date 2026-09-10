#!/usr/bin/env node
// REG-010/011: exercise the actual booking allocator and rendered grid column contracts.
// Deliberately database-free: no booking/proof fixtures may be written to production.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
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
for (const [config, ...files] of suites) {
  const result = spawnSync(process.execPath, [root + 'node_modules/vitest/vitest.mjs', 'run', '--config', root + config, ...files], {
    cwd: config.includes('frontend') ? root + 'apps/frontend' : root, stdio: 'inherit', timeout: 120000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log('verify-reg010-011-settlement-identity PASS: booking S-YYYY-NNNN and separate grid data');
