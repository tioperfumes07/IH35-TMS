#!/usr/bin/env node
/**
 * ROUND 313/319 — /factoring/advances/:id drawer links load + invoice + vendor + bank wire both ways;
 * EntityLink kind=factoring_advance targets that path; /factoring/statements mounts FactorReconciliationPage.
 * §10-B declare: parties LINKED (factor vendor); assets LINKED (load) / N/A(invoice via linked invoices grid);
 * money LINKED (invoice EntityLink, bank_transaction EntityLink, JE reverse on packet); stamps N/A(read surface).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const LABEL = "verify-factoring-advance-drawer-linkage";
export const ALLOW_OFFLINE_SKIP = "static source-shape check; no live DB required";

const P = {
  detail: "apps/frontend/src/pages/accounting/FactoringDetailPage.tsx",
  entity: "apps/frontend/src/components/shared/EntityLink.tsx",
  routes: "apps/frontend/src/routes/manifest.tsx",
  be: "apps/backend/src/accounting/factoring-advances.routes.ts",
};

function read(rel) {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

export function check(s) {
  const f = [];
  if (!/path="\/factoring\/advances\/:id"/.test(s.routes)) f.push(`${P.routes}: missing /factoring/advances/:id route`);
  if (!/path="\/factoring\/statements"/.test(s.routes)) f.push(`${P.routes}: missing /factoring/statements route`);
  if (!/FactorReconciliationPage/.test(s.routes)) f.push(`${P.routes}: statements must mount FactorReconciliationPage`);
  if (!/return `\/factoring\/advances\/\$\{id\}`/.test(s.entity)) f.push(`${P.entity}: factoring_advance must drill to /factoring/advances/:id`);
  if (!/kind="load"/.test(s.detail) || !/source_load_id/.test(s.detail)) f.push(`${P.detail}: load EntityLink both ways required`);
  if (!/kind="invoice"/.test(s.detail)) f.push(`${P.detail}: invoice EntityLink required`);
  if (!/kind="vendor"/.test(s.detail)) f.push(`${P.detail}: factor vendor EntityLink required`);
  if (!/kind="bank_transaction"/.test(s.detail) || !/matched_bank_transaction_id/.test(s.detail)) {
    f.push(`${P.detail}: bank wire EntityLink required`);
  }
  if (!/matched_factoring_advance_id/.test(s.be)) f.push(`${P.be}: detail query must read matched bank wire`);
  if (!/source_load_number/.test(s.be)) f.push(`${P.be}: detail query must return source_load_number`);
  return f;
}

const real = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, read(v)]));
if (process.argv.includes("--selftest")) {
  const ok = check(real).length === 0;
  const broken = check({ ...real, entity: real.entity.replace("/factoring/advances/${id}", "/accounting/factoring/${id}") });
  if (!ok || broken.length === 0) {
    console.error(`${LABEL} --selftest FAIL`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}
const problems = check(real);
if (problems.length) {
  console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — /factoring/advances/:id + statements + §10-B load/invoice/vendor/bank links wired`);
