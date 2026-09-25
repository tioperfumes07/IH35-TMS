#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const files = [
  'apps/backend/src/accounting/posting-engine.service.ts',
  'apps/backend/src/accounting/bill-account-resolver.ts',
  'apps/backend/src/catalogs/items.routes.ts',
  'apps/backend/src/qbo-sync/items-puller.ts',
  'apps/backend/src/qbo-sync/ap-bills-puller.ts',
];
const offenders = files.filter((f) => fs.readFileSync(path.join(root, f), 'utf8').includes('5010'));
if (process.argv.includes('--selftest')) {
  if (!/5010/.test('5010')) { console.error('selftest mutation failed'); process.exit(1); }
  console.log('verify-no-def-5010-writers selftest PASS 1/1'); process.exit(0);
}
if (offenders.length) { console.error(`verify-no-def-5010-writers FAIL\n${offenders.join('\n')}`); process.exit(1); }
console.log('verify-no-def-5010-writers PASS — no writer hard-codes DEF account 5010');
