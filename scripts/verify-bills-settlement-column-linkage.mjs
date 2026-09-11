#!/usr/bin/env node
/** Bills register must resolve its own settlement identity from current source lines. */
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const route = read('apps/backend/src/accounting/bills.routes.ts');
const page = read('apps/frontend/src/pages/accounting/BillsPage.tsx');
const api = read('apps/frontend/src/api/accounting.ts');
function verify(r, p) {
  const sql = r.match(/export const DRIVER_BILL_REGISTER_SQL = `([\s\S]*?)`;/)?.[1];
  assert(sql, 'actual route SQL must be extractable for live proof');
  assert.match(r, /client\.query\(\s*DRIVER_BILL_REGISTER_SQL,/, 'register must execute the proven SQL');
  for (const token of ['LEFT JOIN LATERAL', 'sl.source_driver_bill_id = db.id',
    'sl.operating_company_id = db.operating_company_id', 'ds.operating_company_id = db.operating_company_id',
    'sl.is_active = true', 'sl.voided_at IS NULL', 'ds.voided_at IS NULL',
    "ds.status NOT IN ('void', 'voided', 'cancelled')", 'HAVING count(DISTINCT ds.id) = 1',
    'settlement.settlement_id, settlement.settlement_number', 'db.operating_company_id = $1::uuid',
    'ORDER BY db.created_at DESC, db.id DESC']) assert(sql.includes(token), `missing ${token}`);
  assert(!/ds\.id\s*=\s*db\.settled_in_settlement_id/.test(sql), 'dead stamp join returned');
  const columns = p.split('const driverBillColumns')[1]?.split('\n  );')[0];
  assert(columns, 'driver Bills columns unavailable');
  assert.match(columns, /key: "settlement_number",\s*label: "Settlement Number",\s*alwaysVisible: true,\s*sortable: true/);
  assert.match(columns, /kind="settlement" id=\{b\.settlement_id\} label=\{b\.settlement_number \?\? "—"\}/);
  assert(!columns.includes('b.settled_in_settlement_id'), 'UI still depends on empty settlement stamp');
  return sql;
}
const sql = verify(route, page);
assert.match(api, /settlement_id\?: string \| null/);
assert.match(api, /settlement_number\?: string \| null/);
assert(read('scripts/verify-steps/10481-verify-census-orphans-wired.mjs').includes('verify-bills-settlement-column-linkage.mjs'));
const mutations = ['sl.source_driver_bill_id = db.id', 'sl.is_active = true', 'sl.voided_at IS NULL',
 'ds.voided_at IS NULL', 'sl.operating_company_id = db.operating_company_id',
 'ds.operating_company_id = db.operating_company_id', 'HAVING count(DISTINCT ds.id) = 1',
 'DRIVER_BILL_REGISTER_SQL,'];
for (const token of mutations) assert.throws(() => verify(route.replace(token, 'REMOVED'), page), token);
assert.throws(() => verify(route, page.replace('key: "settlement_number"', 'key: "settlement_display_id"')));
assert.throws(() => verify(route, page.replace('id={b.settlement_id}', 'id={b.settled_in_settlement_id}')));
if (process.argv.includes('--sql')) console.log(sql);
else console.log('verify-bills-settlement-column-linkage PASS — actual route, scoped active lines, unique identity, stable bill rows, canonical column/link; 10 mutations caught');
