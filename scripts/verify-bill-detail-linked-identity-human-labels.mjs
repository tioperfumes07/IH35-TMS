#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";

const service = fs.readFileSync("apps/backend/src/accounting/bills.service.ts", "utf8");
const api = fs.readFileSync("apps/frontend/src/api/accounting.ts", "utf8");
const page = fs.readFileSync("apps/frontend/src/pages/accounting/BillDetailPage.tsx", "utf8");

function verify(s, a, p) {
  const failures = [];
  for (const token of ["wo.display_id AS linked_work_order_display_id", "claim.claim_number AS insurance_claim_number", "SELECT id::text, display_id FROM driver_finance.driver_advances"]) if (!s.includes(token)) failures.push(`missing producer: ${token}`);
  for (const token of ["wo.operating_company_id = b.operating_company_id", "claim.tenant_id = b.operating_company_id"]) if (!s.includes(token)) failures.push(`missing entity scope: ${token}`);
  for (const token of ["linked_work_order_display_id?: string | null", "linked_cash_advance_display_id?: string | null", "insurance_claim_number?: string | null"]) if (!a.includes(token)) failures.push(`missing contract: ${token}`);
  for (const token of ["entityLabel(bill.linked_work_order_display_id, bill.linked_work_order_uuid", "entityLabel(bill.linked_cash_advance_display_id, bill.linked_cash_advance_id", "entityLabel(bill.insurance_claim_number, bill.insurance_claim_id"]) if (!p.includes(token)) failures.push(`missing consumer: ${token}`);
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [service.replace("wo.display_id AS linked_work_order_display_id", "NULL::text AS linked_work_order_display_id"), api, page],
    [service.replace("claim.claim_number AS insurance_claim_number", "NULL::text AS insurance_claim_number"), api, page],
    [service.replace("SELECT id::text, display_id FROM driver_finance.driver_advances", "SELECT id::text FROM driver_finance.driver_advances"), api, page],
    [service, api, page.replace("entityLabel(bill.insurance_claim_number, bill.insurance_claim_id", "entityLabel(null, bill.insurance_claim_id")],
  ];
  mutations.forEach((mutation, index) => { if (verify(...mutation).length === 0) throw new Error(`selftest mutation ${index + 1} escaped`); });
  console.log("verify-bill-detail-linked-identity-human-labels SELFTEST PASS (4/4)");
  process.exit(0);
}
const failures = verify(service, api, page);
if (failures.length) { failures.forEach((failure) => console.error(`FAIL: ${failure}`)); process.exit(1); }
console.log("verify-bill-detail-linked-identity-human-labels PASS — WO, advance, and claim labels are scoped end-to-end");
