#!/usr/bin/env node
/**
 * ACCT-F5592 regression guard — every route in accounting/bills.routes.ts must assert company
 * membership before touching accounting.bills / accounting.bill_payments.
 *
 * 9 of the file's 17 routes had NO assertCompanyMembership call at all (8 GET reads + the POST
 * /bills create route): GET /bills, GET /work-orders/:id/linked-financials,
 * GET /claims/:id/linked-financials, GET /legal-matters/:id/linked-costs,
 * GET /units/:id/linked-financials, GET /bills/:id/payments, GET /bills/:id, POST /bills (create),
 * GET /bill-payments, GET /bill-payments/:id. Live-verified on prod (tiny-field-89581227) that this
 * is a REAL cross-tenant IDOR, not just guard hygiene: accounting.bills / accounting.bill_payments's
 * RLS policy (`bills_tenant_scope_usmca1` / `bill_payments_tenant_scope_usmca1`) only compares
 * operating_company_id against the SAME app.operating_company_id GUC these routes set from the
 * caller-supplied query param -- it is no backstop at all. A company member of Company A could read
 * (or, on the create route, WRITE a fabricated bill into) Company B's books by passing Company B's
 * operating_company_id.
 *
 * This static check (no DB connection) asserts every one of the 9 previously-unguarded routes now
 * calls assertCompanyMembership before its business logic.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify:bills-membership-assert-full-coverage";
const SELFTEST = process.argv.includes("--selftest");
const FILE = "apps/backend/src/accounting/bills.routes.ts";
const GATE_LINE = "await assertCompanyMembership(String(user.uuid), query.data.operating_company_id);";

// [route needle, human label, search window size in chars]
const ROUTES = [
  ['app.get("/api/v1/accounting/bills", ', "GET /bills", 1000],
  ['"/api/v1/accounting/work-orders/:id/linked-financials"', "GET /work-orders/:id/linked-financials", 900],
  ['"/api/v1/accounting/claims/:id/linked-financials"', "GET /claims/:id/linked-financials", 900],
  ['"/api/v1/accounting/legal-matters/:id/linked-costs"', "GET /legal-matters/:id/linked-costs", 900],
  ['"/api/v1/accounting/units/:id/linked-financials"', "GET /units/:id/linked-financials", 900],
  ['app.get("/api/v1/accounting/bills/:id/payments"', "GET /bills/:id/payments", 900],
  ['app.get("/api/v1/accounting/bills/:id", ', "GET /bills/:id", 900],
  ['app.post("/api/v1/accounting/bills", ', "POST /bills (create)", 1300],
  ['app.get("/api/v1/accounting/bill-payments", ', "GET /bill-payments", 900],
  ['app.get("/api/v1/accounting/bill-payments/:id", ', "GET /bill-payments/:id", 900],
];

function assertAll(src) {
  const problems = [];
  for (const [needle, label, windowSize] of ROUTES) {
    const idx = src.indexOf(needle);
    if (idx === -1) {
      problems.push(`${label}: route not found (guard target moved; update this guard)`);
      continue;
    }
    const window = src.slice(idx, idx + windowSize);
    if (!window.includes(GATE_LINE)) {
      problems.push(`${label}: does not call assertCompanyMembership before business logic`);
    }
  }
  return problems;
}

const read = () => fs.readFileSync(path.join(ROOT, FILE), "utf8");

if (SELFTEST) {
  const src = read();
  // Plant the defect on the highest-severity route (POST /bills create) by removing the gate line
  // immediately after its own comment block, matching the exact text this fix inserted.
  const createNeedle = 'app.post("/api/v1/accounting/bills", ';
  const idx = src.indexOf(createNeedle);
  if (idx === -1) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: POST /bills route not found in real code`);
    process.exit(1);
  }
  const gateIdx = src.indexOf(GATE_LINE, idx);
  if (gateIdx === -1 || gateIdx - idx > 1300) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: gate line not found near POST /bills (guard text drifted from real code)`);
    process.exit(1);
  }
  const lineStart = src.lastIndexOf("\n", gateIdx) + 1;
  const lineEnd = src.indexOf("\n", gateIdx) + 1;
  const planted = src.slice(0, lineStart) + src.slice(lineEnd);

  const plantedProblems = assertAll(planted);
  if (!plantedProblems.some((p) => p.startsWith("POST /bills (create)"))) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect (POST /bills gate dropped) not caught`);
    process.exit(1);
  }

  const live = assertAll(src);
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertAll(read());
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — all 9 previously-unguarded routes now assert company membership`);
