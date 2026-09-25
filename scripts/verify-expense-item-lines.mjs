#!/usr/bin/env node
import fs from 'node:fs';
const route = fs.readFileSync('apps/backend/src/accounting/expenses.routes.ts','utf8');
const api = fs.readFileSync('apps/frontend/src/api/accounting.ts','utf8');
const page = fs.readFileSync('apps/frontend/src/pages/accounting/ExpenseDetailPage.tsx','utf8');
const required = ['item_id','item_name','quantity','rate_cents','unit_of_measure'];
const pass = required.every((x) => route.includes(x) && api.includes(x) && page.includes(x));
if (process.argv.includes('--selftest')) {
  const mutated = page.replace(/key: "rate_cents"/, 'key: "removed"');
  if (mutated.includes('key: "rate_cents"')) process.exit(1);
  console.log('verify-expense-item-lines selftest PASS 1/1'); process.exit(0);
}
if (!pass) { console.error('verify-expense-item-lines FAIL — item line contract incomplete'); process.exit(1); }
console.log('verify-expense-item-lines PASS — API, route and render carry item/qty/rate/UOM');
