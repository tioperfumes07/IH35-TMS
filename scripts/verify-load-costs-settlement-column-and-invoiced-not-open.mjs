#!/usr/bin/env node
// R443.139 supersedes NEW-09's invoice-as-closed rule for the current cost board.
// Keep the registered filename: settlement linkage remains guarded, issued revenue stays visible.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const LABEL='verify-load-costs-settlement-column-and-invoiced-not-open';
const src={
  route:fs.readFileSync('apps/backend/src/accounting/load-costs-board.routes.ts','utf8'),
  page:fs.readFileSync('apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx','utf8'),
  model:fs.readFileSync('apps/backend/src/accounting/load-costs-live-documents.sql.ts','utf8'),
};
const rules=[
 ['route','settlement_info AS ('],
 ['route','JOIN driver_finance.settlement_lines sl ON sl.source_driver_bill_id = db.id'],
 ['route','ds.id = COALESCE(linked.presettlement_link_id, bill_link.settlement_id)'],
 ['route','si.settlement_display_id, si.settlement_id'],
 ['route','LEFT JOIN settlement_info si ON si.load_id=l.id'],
 ['route','settlement: "si.settlement_display_id"'],
 ['page','key: "settlement", label: "Settlement/Tour", testId: "col-settlement"'],
 ['page','settlement_display_id: string | null;'],
 ['page','settlement_id: string | null;'],
 // ENG-52 (2026-10-24): board now mounts loadCostRollupLateral (verify-money-surfaces-agree RULE1)
 ['route','${loadCostRollupLateral("l.id", "l.operating_company_id")}'],
 ['route','lcr.is_invoiced'],
 ['model',"i.status NOT IN ('draft','proforma','void','voided')"],
 ['page','is_invoiced: boolean;'],
 ['page','const isClosed = (r: BoardRow) => CLOSED.includes(r.status);'],
 ['page','if (f === "delivered_open") return DELIVERED.includes(r.status) && !isClosed(r);'],
];
export function violations(s) {
 const errors=rules.filter(([file,needle])=>!s[file].includes(needle)).map(([,needle])=>needle);
 const closed=s.page.split('const CLOSED = [')[1]?.split('];')[0] ?? '';
 if(closed.includes('"invoiced"') || closed.includes('"paid"')) errors.push('money status silently hides current costs');
 return errors;
}
assert.deepEqual(violations(src),[]);
if(process.argv.includes('--selftest')) {
 for(const [file,needle] of rules) {
   assert(violations({...src,[file]:src[file].split(needle).join('MUTATED')}).length>0,'escaped '+needle);
 }
 assert(violations({...src,page:src.page.replace('const CLOSED = [','const CLOSED = ["invoiced",')}).length>0);
 console.log(LABEL+' SELFTEST PASS ('+(rules.length+1)+'/'+(rules.length+1)+' planted defects caught)');
} else console.log(LABEL+' PASS — settlement linkage retained; invoice revenue never hides unsettled costs');
