#!/usr/bin/env node
/**
 * Bills register must resolve its own settlement identity from current source lines.
 *
 * ACCT-F26140 follow-up (Lead-directed, 2026-09-11 16:25 Central): the register's LATERAL used to
 * be a private literal string in bills.routes.ts. driver-bills-list.routes.ts and
 * cash-flow.service.ts each grew their OWN, slightly different copy of "resolve this bill's
 * settlement" — neither excluded cancelled/voided settlements, so a bill attached only to a
 * CANCELLED settlement (12 cancelled by the 2026-09-11 reverse+repost rebuild) still showed as
 * "settled" (60/66 vs the register's correct ~27/66). Extended here (per Lead's explicit
 * instruction) to assert all three call sites import and use the SAME exported predicate from
 * settlement-resolution.sql.ts — not a textually-similar private copy that can drift again.
 */
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const SHARED_MODULE_PATH = 'apps/backend/src/driver-finance/settlement-resolution.sql.ts';
const SHARED_IMPORT_SPECIFIER = '../driver-finance/settlement-resolution.sql.js';

function verifySharedModule(shared) {
  const lateral = shared.match(/export const RESOLVE_ACTIVE_SETTLEMENT_LATERAL_SQL = `([\s\S]*?)`;/)?.[1];
  assert(lateral, 'shared RESOLVE_ACTIVE_SETTLEMENT_LATERAL_SQL must be extractable');
  const existsSql = shared.match(/export const BILL_HAS_ACTIVE_SETTLEMENT_EXISTS_SQL = `([\s\S]*?)`;/)?.[1];
  assert(existsSql, 'shared BILL_HAS_ACTIVE_SETTLEMENT_EXISTS_SQL must be extractable');
  const predicate = shared.match(/export const ACTIVE_SETTLEMENT_LINE_PREDICATE_SQL =\s*\n?\s*`([\s\S]*?)`;/)?.[1];
  assert(predicate, 'shared ACTIVE_SETTLEMENT_LINE_PREDICATE_SQL must be extractable');
  for (const token of ['sl.is_active = true', 'sl.voided_at IS NULL', 'ds.voided_at IS NULL',
    "ds.status NOT IN ('void', 'voided', 'cancelled')"]) {
    assert(predicate.includes(token), `shared predicate missing ${token}`);
  }
  for (const token of ['LEFT JOIN LATERAL', 'sl.source_driver_bill_id = db.id',
    'sl.operating_company_id = db.operating_company_id', 'ds.operating_company_id = db.operating_company_id',
    'HAVING count(DISTINCT ds.id) = 1', 'AS settlement_id, min(ds.display_id) AS settlement_number',
    '${ACTIVE_SETTLEMENT_LINE_PREDICATE_SQL}']) {
    assert(lateral.includes(token), `shared LATERAL missing ${token}`);
  }
  assert(existsSql.includes('sl.source_driver_bill_id = db.id'), 'shared EXISTS missing source_driver_bill_id');
  assert(existsSql.includes('${ACTIVE_SETTLEMENT_LINE_PREDICATE_SQL}'), 'shared EXISTS must reuse the same predicate constant');
  return { lateral, existsSql, predicate };
}

function verifyColumns(page) {
  const columns = page.split('const driverBillColumns')[1]?.split('\n  );')[0];
  assert(columns, 'driver Bills columns unavailable');
  assert.match(columns, /key: "settlement_number",\s*label: "Settlement Number",\s*alwaysVisible: true,\s*sortable: true/);
  assert.match(columns, /kind="settlement" id=\{b\.settlement_id\} label=\{b\.settlement_number \?\? "—"\}/);
  assert(!columns.includes('b.settled_in_settlement_id'), 'UI still depends on empty settlement stamp');
}

function verifyRegister(route, shared) {
  verifySharedModule(shared);
  assert(route.includes(`from "${SHARED_IMPORT_SPECIFIER}"`) && route.includes('RESOLVE_ACTIVE_SETTLEMENT_LATERAL_SQL'),
    'register must import the shared predicate, not a private copy');
  const sql = route.match(/export const DRIVER_BILL_REGISTER_SQL = `([\s\S]*?)`;/)?.[1];
  assert(sql, 'actual route SQL must be extractable for live proof');
  assert.match(route, /client\.query\(\s*DRIVER_BILL_REGISTER_SQL,/, 'register must execute the proven SQL');
  assert(sql.includes('${RESOLVE_ACTIVE_SETTLEMENT_LATERAL_SQL}'), 'register must embed the shared predicate via import, not a private literal');
  for (const token of ['settlement.settlement_id, settlement.settlement_number', 'db.operating_company_id = $1::uuid',
    'ORDER BY db.created_at DESC, db.id DESC']) assert(sql.includes(token), `missing ${token}`);
  assert(!/ds\.id\s*=\s*db\.settled_in_settlement_id/.test(sql), 'dead stamp join returned');
  return sql;
}

/** driver-bills-list.routes.ts and cash-flow.service.ts must import from the SAME shared module —
 * this is the actual "one exported predicate, three call sites" assertion. Each file's relative
 * import path differs by its own directory depth, so this checks the module SPECIFIER resolves to
 * settlement-resolution.sql.ts (ends in that filename), not one fixed literal path. */
function verifySharedConsumer(source, importedNames) {
  assert(/from\s+"[^"]*settlement-resolution\.sql\.js"/.test(source), 'must import from settlement-resolution.sql.js (the shared module), not a private copy');
  for (const name of importedNames) assert(source.includes(name), `must import/use ${name}`);
}

const route = read('apps/backend/src/accounting/bills.routes.ts');
const page = read('apps/frontend/src/pages/accounting/BillsPage.tsx');
const api = read('apps/frontend/src/api/accounting.ts');
const shared = read(SHARED_MODULE_PATH);
const driverBillsList = read('apps/backend/src/driver-finance/driver-bills-list.routes.ts');
const cashFlow = read('apps/backend/src/cash-flow/cash-flow.service.ts');

const sql = verifyRegister(route, shared);
verifyColumns(page);
verifySharedConsumer(driverBillsList, ['RESOLVE_ACTIVE_SETTLEMENT_LATERAL_SQL']);
verifySharedConsumer(cashFlow, ['BILL_HAS_ACTIVE_SETTLEMENT_EXISTS_SQL']);

assert.match(api, /settlement_id\?: string \| null|settlement_id: string \| null/);
assert(read('scripts/verify-steps/10481-verify-census-orphans-wired.mjs').includes('verify-bills-settlement-column-linkage.mjs'));

const mutations = ['sl.source_driver_bill_id = db.id', 'sl.is_active = true', 'sl.voided_at IS NULL',
 'ds.voided_at IS NULL', 'sl.operating_company_id = db.operating_company_id',
 'ds.operating_company_id = db.operating_company_id', 'HAVING count(DISTINCT ds.id) = 1'];
for (const token of mutations) assert.throws(() => verifySharedModule(shared.replaceAll(token, 'REMOVED')));
assert.throws(() => verifyRegister(route.replace('DRIVER_BILL_REGISTER_SQL,', 'REMOVED'), shared), /must execute the proven SQL/);
assert.throws(() => verifyRegister(route.replaceAll('RESOLVE_ACTIVE_SETTLEMENT_LATERAL_SQL', 'REMOVED'), shared));
assert.throws(() => verifySharedConsumer(driverBillsList.replaceAll('RESOLVE_ACTIVE_SETTLEMENT_LATERAL_SQL', 'REMOVED'), ['RESOLVE_ACTIVE_SETTLEMENT_LATERAL_SQL']));
assert.throws(() => verifySharedConsumer(cashFlow.replaceAll('BILL_HAS_ACTIVE_SETTLEMENT_EXISTS_SQL', 'REMOVED'), ['BILL_HAS_ACTIVE_SETTLEMENT_EXISTS_SQL']));
assert.throws(() => verifyColumns(page.replace('key: "settlement_number"', 'key: "settlement_display_id"')));
assert.throws(() => verifyColumns(page.replace('id={b.settlement_id}', 'id={b.settled_in_settlement_id}')));

if (process.argv.includes('--sql')) console.log(sql);
else console.log('verify-bills-settlement-column-linkage PASS — actual route, scoped active lines, unique identity, stable bill rows, canonical column/link, ALL THREE call sites (register, driver-bills-list, cash-flow) share the one exported predicate; 12 mutations caught');
