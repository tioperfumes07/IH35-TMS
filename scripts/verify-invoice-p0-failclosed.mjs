#!/usr/bin/env node
/**
 * P-INVOICE P0 fail-closed (#3177 P0 #1 + #2) — Law §9.
 *
 * Reverse drill (Invoice↔JE EntityLink) lives in PR #3188 — NOT this guard.
 *
 * This guard locks:
 * 1) Posting/send refuse null/unresolvable income (no invented CoA; HOLD designate).
 * 2) Load-revenue lines require source_load_id (fail closed).
 *
 * Rule 17: verify-step only — do NOT edit package.json / locked-guards / ci.yml.
 * Step number ≥1227 (1222–1224 = #3188 reverse drill; avoid 1225 collision with superseded #3191).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-invoice-p0-failclosed";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertFailClosed() {
  const errors = [];
  const posting = read("apps/backend/src/accounting/posting-engine.service.ts");
  const guards = read("apps/backend/src/accounting/invoice-linkage-guards.ts");
  const routes = read("apps/backend/src/accounting/posting-engine.routes.ts");
  const invoices = read("apps/backend/src/accounting/invoices.routes.ts");

  if (!fs.existsSync(path.join(ROOT, "apps/backend/src/accounting/invoice-linkage-guards.ts"))) {
    errors.push("missing invoice-linkage-guards.ts");
  }
  if (!/InvoiceRevenueAccountError/.test(posting) || !/"INVOICE_LINE_REVENUE_UNRESOLVED"/.test(posting)) {
    errors.push("posting-engine: must hard-fail INVOICE_LINE_REVENUE_UNRESOLVED (null income)");
  }
  if (/revenue_default/.test(posting) || /resolveFirstAccountByType/.test(posting)) {
    errors.push("posting-engine: must not invent/default a revenue CoA account");
  }
  if (!/INVOICE_LOAD_SOURCE_REQUIRED/.test(posting) || !/assertLoadRevenueHasSourceLoad/.test(posting)) {
    errors.push("posting-engine: must fail closed when load revenue lacks source_load_id");
  }
  if (!/LOAD_REVENUE_LINE_TYPES/.test(guards) || !/assertLoadRevenueHasSourceLoad/.test(guards)) {
    errors.push("invoice-linkage-guards: LOAD_REVENUE_LINE_TYPES + assertLoadRevenueHasSourceLoad required");
  }
  if (!/assertRevenueLinesHaveIncomeAccount/.test(guards)) {
    errors.push("invoice-linkage-guards: assertRevenueLinesHaveIncomeAccount required");
  }
  if (!/HOLD designate/.test(guards) && !/HOLD designate/.test(posting)) {
    errors.push("guards/posting: clear HOLD designate messaging when map/role missing");
  }
  if (!/invoice_load_source_required/.test(routes) || !/invoice_line_revenue_unresolved/.test(routes)) {
    errors.push("posting-engine.routes: must map load-source + income unresolved errors");
  }
  if (!/assertLoadRevenueHasSourceLoad/.test(invoices) || !/assertRevenueLinesHaveIncomeAccount/.test(invoices)) {
    errors.push("invoices.routes send: must fail closed on income + source_load_id");
  }
  // Must NOT require FE reverse-drill surfaces here (owned by #3188).
  return errors;
}

function selftest() {
  const errors = assertFailClosed();
  if (errors.length) {
    console.error(`${LABEL} SELFTEST FAILED — ${errors.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = assertFailClosed();
if (errors.length) {
  console.error(`${LABEL} FAIL`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
