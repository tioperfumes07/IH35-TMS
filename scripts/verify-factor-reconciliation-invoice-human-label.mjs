#!/usr/bin/env node

import fs from "node:fs";
import process from "node:process";

const service = fs.readFileSync("apps/backend/src/accounting/factor-reconciliation/recon.service.ts", "utf8");
const api = fs.readFileSync("apps/frontend/src/api/accounting.ts", "utf8");
const page = fs.readFileSync("apps/frontend/src/pages/accounting/FactorReconciliationPage.tsx", "utf8");

function verify(s, a, p) {
  const failures = [];
  if (!s.includes("i.display_id AS invoice_display_id")) failures.push("invoice display id is not projected");
  if (!s.includes("LEFT JOIN accounting.invoices i")) failures.push("canonical invoice table is not joined");
  if (!s.includes("i.operating_company_id = ri.operating_company_id")) failures.push("invoice label join is not company-scoped");
  if (!a.includes("invoice_display_id: string | null")) failures.push("client contract omits invoice display id");
  if (!p.includes("entityLabel(item.invoice_display_id, item.invoice_id, \"Invoice\")")) failures.push("mounted invoice drill discards its human label");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [service.replace("i.display_id AS invoice_display_id", "NULL::text AS invoice_display_id"), api, page],
    [service.replace("i.operating_company_id = ri.operating_company_id", "TRUE"), api, page],
    [service, api, page.replace("entityLabel(item.invoice_display_id, item.invoice_id, \"Invoice\")", "entityLabel(null, item.invoice_id, \"Invoice\")")],
  ];
  mutations.forEach((mutation, index) => {
    if (verify(...mutation).length === 0) throw new Error(`selftest mutation ${index + 1} escaped`);
  });
  console.log("verify-factor-reconciliation-invoice-human-label SELFTEST PASS (3/3)");
  process.exit(0);
}

const failures = verify(service, api, page);
if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL: ${failure}`));
  process.exit(1);
}
console.log("verify-factor-reconciliation-invoice-human-label PASS — scoped producer, contract, and mounted consumer are wired");
