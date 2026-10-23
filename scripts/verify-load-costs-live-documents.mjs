#!/usr/bin/env node
// R443.139 #8(a): native document read contract. Database semantics are independently exercised
// by load-costs-live-documents.db.test.ts on migrated PostgreSQL; this arm catches wiring drift.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const paths = {
  model: 'apps/backend/src/accounting/load-costs-live-documents.sql.ts',
  predicates: 'apps/backend/src/accounting/live-document-predicates.sql.ts',
  route: 'apps/backend/src/accounting/load-costs-board.routes.ts',
  rollup: 'apps/backend/src/accounting/load-cost-rollup.sql.ts',
  scope: 'apps/backend/src/dispatch/canonical-active-load-set.ts',
  page: 'apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx',
};
const rules = [
  ['model','SUM(i.total_cents-i.tax_cents)','issued revenue excludes tax liability'],
  ['model','issued.document_count > 0','zero-dollar issued invoice is authoritative'],
  ['model','SUM(lcl.amount_cents)','booking revenue (inner alias lcl — #27126: no caller alias can collide)'],
  ['model','lcl.operating_company_id = ${load}.operating_company_id','company-scoped charges'],
  ['model','i.voided_at IS NULL','void invoice excluded'],
  ['model',"i.status NOT IN ('draft','proforma','void','voided')",'only issued invoice replaces booking'],
  ['model','COALESCE(el.load_id,e.load_id)','line expense attribution'],
  ['model','${liveExpense("e")}','void expense excluded through canonical predicate'],
  ['model','${liveBillLine("bl")}','void bill line excluded through canonical predicate'],
  ['predicates','export function liveExpense(alias: string)','expense liveness defined once'],
  ['predicates',"(${a}.status NOT IN ('void', 'voided') AND ${a}.voided_at IS NULL)",'status and timestamp both exclude void expenses'],
  ['predicates','return `${sqlAlias(alias)}.voided_at IS NULL`;','bill line timestamp exclusion retained'],
  ['model','db.accrued_team_bill_id','team accrual not double counted'],
  ['model','db.accrued_bill_id','primary accrual not double counted'],
  ['route','WITH ${LOAD_COST_DOCUMENTS_CTE}','shared document costs mounted'],
  // 443.257-C (#27231): board revenue replaced per-row loadCostRollupLateral with set-based CTEs.
  ['route','invoice_rollup AS','set-based invoice rollup CTE mounted on the board'],
  ['route','charge_line_rollup AS','set-based charge-line rollup CTE mounted on the board'],
  ['route','rev_cte AS','revenue CTE (rev_cte) mounted on the board'],
  ['rollup','${loadCostsRevenueJoin("cl", "rev")}','the rollup mounts the shared revenue join'],
  ['route','canonicalLoadCostsOpenClause("l", parsed.data.show_voided)','canonical current-cost scope mounted'],
  ['route','NULLIF(COALESCE(rev_cte.revenue_cents,0), 0)','margin percentage uses document revenue (rev_cte)'],
  ['scope','export function canonicalLoadCostsOpenClause','named canonical cost scope'],
  ['scope',"AND ds.voided_at IS NULL AND ds.status='closed'",'actual closed settlement excluded'],
  ['scope','${alias}.is_sample_data IS NOT TRUE','sample loads excluded'],
  ['page','const isClosed = (r: BoardRow) => CLOSED.includes(r.status);','invoice does not hide costs'],
  ['page','refetchInterval: 15_000','refresh live documents'],
  ['page','useState<FilterPill>("all_open")','initial view includes delivered open loads'],
  ['page','Proforma: current booking charges','revenue provenance visible'],
];
export function failures(sources) {
  const errors = rules.filter(([file,needle])=>!sources[file].includes(needle)).map(([, ,label])=>label);
  const costScope = sources.scope.split('export function canonicalLoadCostsOpenClause')[1] ?? '';
  if (costScope.includes('accounting.invoices')) errors.push('invoice incorrectly finishes cost scope');
  if (sources.route.includes('l.rate_total_cents::text AS revenue_cents')) errors.push('header revenue bypass');
  return errors;
}
const source = Object.fromEntries(Object.entries(paths).map(([key,path])=>[key,fs.readFileSync(path,'utf8')]));
assert.deepEqual(failures(source),[], 'live-document read contract');
if (process.argv.includes('--selftest')) {
  for (const [file,needle,label] of rules) {
    const mutant={...source,[file]:source[file].split(needle).join('MUTATED')};
    assert(failures(mutant).length>0,`escaped: ${label}`);
  }
  console.log(`verify-load-costs-live-documents SELFTEST: ${rules.length}/${rules.length} mutations caught`);
} else console.log(`verify-load-costs-live-documents PASS: ${rules.length} contracts`);
