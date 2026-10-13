#!/usr/bin/env node
// R443.139: invoice issuance changes revenue, not current-cost membership.
// Closed nonvoid settlements still exclude loads. USMCA read-only, counts only.
export const REQUIRES_LIVE_DB = "Load Costs closed-settlement exclusion, USMCA read-only";
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { register } from 'tsx/esm/api';
import pg from 'pg';
import { buildPgClientConfig } from './lib/pg-connection-options.cjs';
register();
const { canonicalLoadCostsOpenClause } = await import('../apps/backend/src/dispatch/canonical-active-load-set.ts');
const USMCA='5c854333-6ea5-4faa-af31-67cb272fef80';
const LABEL='verify-load-costs-board-excludes-settled';
const boardScope=canonicalLoadCostsOpenClause('l');
const route=fs.readFileSync('apps/backend/src/accounting/load-costs-board.routes.ts','utf8');
assert(route.includes('canonicalLoadCostsOpenClause("l", parsed.data.show_voided)'), 'actual board must use guarded scope');
const required=["sl.is_active IS TRUE","ds.voided_at IS NULL","ds.status='closed'",
  'ds.operating_company_id=l.operating_company_id','db.voided_at IS NULL',
  "db.status NOT IN ('void','voided')",'l.is_sample_data IS NOT TRUE','l.soft_deleted_at IS NULL'];
export function scopeFailures(sql) { return required.filter(part=>!sql.includes(part)); }
assert.deepEqual(scopeFailures(boardScope),[]);
if(process.argv.includes('--selftest')) {
  for(const needle of required) assert(scopeFailures(boardScope.split(needle).join('MUTATED')).length>0,needle);
  assert(!boardScope.includes('accounting.invoices'),'issued invoice must not hide unsettled costs');
  console.log(LABEL+' SELFTEST: '+required.length+'/'+required.length+' mutations caught');
} else {
  const url=process.env.DATABASE_URL;
  if(!url) throw new Error(LABEL+': DATABASE_URL required (not a pass)');
  const db=new pg.Client(buildPgClientConfig(url));
  try {
    await db.connect();
    await db.query('BEGIN READ ONLY');
    await db.query("SET LOCAL app.bypass_rls='lucia'");
    // Independently derived closed membership, not intersection with our own negation.
    const sql=`WITH settled AS (
      SELECT sl.load_id FROM driver_finance.settlement_lines sl
      JOIN driver_finance.driver_settlements ds ON ds.id=sl.settlement_id
      WHERE ds.operating_company_id=$1::uuid AND ds.status='closed' AND ds.voided_at IS NULL AND sl.is_active IS TRUE
      UNION
      SELECT db.load_id FROM driver_finance.driver_bills db
      JOIN driver_finance.driver_settlements ds ON ds.id=db.settled_in_settlement_id AND ds.operating_company_id=db.operating_company_id
      WHERE db.operating_company_id=$1::uuid AND ds.status='closed' AND ds.voided_at IS NULL
        AND db.voided_at IS NULL AND db.status NOT IN ('void','voided')
    ) SELECT count(*)::int AS leaks FROM mdata.loads l
       WHERE l.operating_company_id=$1::uuid AND ${boardScope}
         AND EXISTS (SELECT 1 FROM settled s WHERE s.load_id=l.id)`;
    const first=Number((await db.query(sql,[USMCA])).rows[0].leaks);
    const second=first===0?Number((await db.query(sql,[USMCA])).rows[0].leaks):first;
    await db.query('ROLLBACK');
    assert.equal(first,0,'closed settlement load on current-cost board');
    assert.equal(second,0,'repeat closed settlement leak count');
    console.log(LABEL+': PASS — USMCA closed-settlement leaks='+first+', repeat='+second);
  } finally {
    await db.query('ROLLBACK').catch(()=>{});
    await db.end();
  }
}
