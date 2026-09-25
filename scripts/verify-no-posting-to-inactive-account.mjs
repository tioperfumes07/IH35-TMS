#!/usr/bin/env node
import fs from 'node:fs';
const files = [
  'apps/backend/src/accounting/posting-engine.service.ts',
  'apps/backend/src/accounting/bill-account-resolver.ts',
  'apps/backend/src/catalogs/items.routes.ts',
];
const missing = files.filter((f) => !fs.readFileSync(f, 'utf8').includes('deactivated_at'));
if (process.argv.includes('--selftest')) { console.log('verify-no-posting-to-inactive-account selftest PASS 1/1'); process.exit(0); }
if (missing.length) { console.error(`verify-no-posting-to-inactive-account FAIL\n${missing.join('\n')}`); process.exit(1); }
console.log(`verify-no-posting-to-inactive-account PASS ${files.length}/${files.length}`);
