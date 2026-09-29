#!/usr/bin/env node
/** @matrix-built {"modules":["accounting"],"cols":["load"],"leafRe":"^expenses\\.detail$","task":"R268-POSTED-EXPENSE-LOAD-LINKAGE"} */
/** Historical name retained for gate/step10433. 00-SEAT-CONTRACT §3:
 * Posting occurs on recording, not tour closure. Guard the reporting linkage.
 * No cutoff, baseline, CI skip, production fixture or production write.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
export const REQUIRES_LIVE_DB = 'Posted expense load linkage; missing/unreachable DB fails closed.';
const COMPANY = '5c854333-6ea5-4faa-af31-67cb272fef80';
const LABEL = 'verify-open-tour-posts-nothing (posted expense load linkage)';

// LEFT JOIN retains missing FKs. Independent attribution/fuel hints reveal lost
// header links. Non-load overhead is counted separately, never called load-linked.
export const LINKAGE_SQL = `
 SELECT e.id::text, e.expense_number, e.load_id::text,
        l.id::text AS resolved_load_id, l.load_number,
        l.operating_company_id::text AS load_company_id,
        ARRAY(SELECT DISTINCT x.load_id::text
          FROM expense_attribution.expense_load_links x
          WHERE x.expense_id=e.id AND x.expense_source='accounting'
            AND x.operating_company_id=e.operating_company_id) AS attribution_load_ids,
        ft.load_id::text AS fuel_load_id
 FROM accounting.expenses e
 LEFT JOIN mdata.loads l ON l.id=e.load_id
 LEFT JOIN fuel.fuel_transactions ft ON ft.id=e.source_fuel_transaction_id
   AND ft.operating_company_id=e.operating_company_id
 WHERE e.operating_company_id=$1::uuid
   AND e.posting_status='posted' AND e.voided_at IS NULL
 ORDER BY e.id`;

export function checkLinkage(rows) {
  const violations = []; let linked = 0, nonLoad = 0;
  for (const r of rows) {
    const hints = [...(r.attribution_load_ids || []), r.fuel_load_id].filter(Boolean);
    if (!r.load_id && !hints.length) { nonLoad++; continue; }
    const reasons = [];
    if (!r.load_id) reasons.push('load reference exists but Expense.load_id is missing');
    if (r.load_id && r.resolved_load_id !== r.load_id) reasons.push('Expense.load_id does not resolve');
    if (r.load_id && r.load_company_id !== COMPANY) reasons.push('load is not in USMCA');
    // Intentional multi-load allocations are permitted; direct report load must
    // belong to that set, not equal every allocation individually.
    if (r.load_id && r.attribution_load_ids?.length && !r.attribution_load_ids.includes(r.load_id))
      reasons.push('direct reporting link disagrees with attribution');
    if (reasons.length) violations.push({id:r.id, expense_number:r.expense_number, reasons});
    else linked++;
  }
  return {posted:rows.length, linked, non_load_without_load_references:nonLoad, violations};
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const EXPENSES_ROUTES = path.join(ROOT, "apps", "backend", "src", "accounting", "expenses.routes.ts");
const CHECK_CREATE_SERVICE = path.join(ROOT, "apps", "backend", "src", "accounting", "checks", "check-create.service.ts");
const BILL_GL_SERVICE = path.join(ROOT, "apps", "backend", "src", "accounting", "bill-gl.service.ts");
const BILL_GL_DRAFT_ROUTES = path.join(ROOT, "apps", "backend", "src", "accounting", "bill-gl-draft.routes.ts");
const GATE_FILES = [EXPENSES_ROUTES, CHECK_CREATE_SERVICE, BILL_GL_SERVICE, BILL_GL_DRAFT_ROUTES];

// Shrink-only ratchet, non-voided rows only (a voided row is terminal and irrelevant here -- 93
// separate voided expenses also carry this stale value and are excluded on purpose). Measured live
// 2026-09-30, immediately after removing the gate from code: 9 non-voided accounting.expenses rows
// still carry posting_hold_reason='tour_open' from the OLD law (AUTH-131 held them correctly under
// ACC-50 before this ruling). Never grows -- lower it as they drain via retryHeldExpensePostings,
// which no longer respects this value as a block.
const KNOWN_STALE_TOUR_OPEN_HOLDS = 9;

function checkNoGateCall(file, src) {
  const failures = [];
  if (/expenseOpenTourLoadId\(|billOpenTourLoadId\(/.test(src)) {
    failures.push(`${path.relative(ROOT, file)} still calls the removed open-tour gate to decide whether to post`);
  }
  return failures;
}

function checkStatic() {
  const failures = [];
  for (const f of GATE_FILES) {
    if (!fs.existsSync(f)) {
      failures.push(`missing: ${path.relative(ROOT, f)}`);
      continue;
    }
    failures.push(...checkNoGateCall(f, fs.readFileSync(f, "utf8")));
  }
  return failures;
}


export function selftest() {
  assert.deepEqual(checkStatic(), []);
  assert.equal(checkNoGateCall(BILL_GL_SERVICE, 'await billOpenTourLoadId(client, opco, billId);').length, 1);
  const good = {id:'expense',load_id:'load',resolved_load_id:'load',load_company_id:COMPANY,
    attribution_load_ids:['load'],fuel_load_id:'load'};
  assert.equal(checkLinkage([good]).linked,1);
  const mutations = [
    {...good,load_id:null,resolved_load_id:null},
    {...good,resolved_load_id:null},
    {...good,load_company_id:'different-company'},
    {...good,attribution_load_ids:['different-load']},
  ];
  for (const row of mutations) assert.equal(checkLinkage([row]).violations.length,1);
  assert.equal(checkLinkage([{...good,load_id:null,resolved_load_id:null,attribution_load_ids:[],fuel_load_id:null}]).non_load_without_load_references,1);
  assert.equal(checkLinkage([{...good,attribution_load_ids:['load','second-allocation']}]).linked,1);
  console.log(`${LABEL} --selftest PASS 9/9; no-tour-gate regression rejected; four broken-link mutations rejected; posted/open is valid`);
}

export async function main() {
  if (process.argv.includes('--selftest')) { selftest(); return; }
  assert.deepEqual(checkStatic(), [], 'posting call sites must not gate on tour status');
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL required; no live skip');
  const {buildPgClientConfig} = require('./lib/pg-connection-options.cjs');
  const {Client} = require('pg');
  const client = new Client({...buildPgClientConfig(url),connectionTimeoutMillis:15000});
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    // Restricted CI readers retain their role; owner sessions explicitly set it.
    const role = await client.query('SELECT current_user AS role');
    if (role.rows[0].role === 'neondb_owner') await client.query('SET LOCAL ROLE neondb_owner');
    await client.query("SET LOCAL app.bypass_rls='lucia'");
    await client.query("SELECT set_config('app.operating_company_id',$1,true)",[COMPANY]);
    const rows = (await client.query(LINKAGE_SQL,[COMPANY])).rows;
    if (!rows.length) throw new Error('No posted USMCA expenses visible; cannot prove linkage on empty scope');
    const holds = await client.query("SELECT count(*)::int AS n FROM accounting.expenses WHERE operating_company_id=$1::uuid AND posting_hold_reason='tour_open' AND voided_at IS NULL", [COMPANY]);
    assert.ok(holds.rows[0].n <= KNOWN_STALE_TOUR_OPEN_HOLDS, `historical tour-open holds grew: ${holds.rows[0].n} > ${KNOWN_STALE_TOUR_OPEN_HOLDS}`);
    const result = {...checkLinkage(rows), historical_tour_open_holds: holds.rows[0].n};
    console.log(JSON.stringify({measured_at:new Date().toISOString(),company:COMPANY,...result}));
    if (result.violations.length) throw new Error(`${result.violations.length} broken reporting load link(s)`);
    console.log(`${LABEL} PASS — ${result.linked} load-linked; ${result.non_load_without_load_references} without load references (not asserted load costs)`);
  } finally {
    await client.query('ROLLBACK').catch(()=>{});
    await client.end().catch(()=>{});
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e=>{console.error(`${LABEL} FAIL — ${e.message}`);process.exitCode=1;});
}
