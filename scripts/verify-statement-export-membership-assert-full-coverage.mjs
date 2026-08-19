#!/usr/bin/env node
/**
 * ACCT-F5593 regression guard — every route in accounting/statement-export.routes.ts must assert
 * company membership before generating a downloadable financial-statement PDF/XLSX.
 *
 * 11 of the file's 12 export routes had NO assertCompanyMembership call at all: only
 * trial-balance/export/pdf had it (from an earlier, unrelated fix); trial-balance/export/xlsx,
 * profit-loss/export/{pdf,xlsx}, balance-sheet/export/{pdf,xlsx}, cash-flow/export/{pdf,xlsx},
 * ar-aging/export/{pdf,xlsx}, ap-aging/export/{pdf,xlsx} had none. statement-export.service.ts's
 * export* functions set app.operating_company_id directly from the caller-supplied value with no
 * independent membership check of their own -- same class as ACCT-F5592
 * (accounting/bills.routes.ts). A company member of one entity could download another entity's
 * full Trial Balance / P&L / Balance Sheet / Cash Flow / AR or AP Aging statement as a real
 * PDF/XLSX file simply by passing that entity's operating_company_id.
 *
 * This static check (no DB connection) asserts every one of the file's 12 routes calls
 * assertCompanyMembership before generating the export.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify:statement-export-membership-assert-full-coverage";
const SELFTEST = process.argv.includes("--selftest");
const FILE = "apps/backend/src/accounting/statement-export.routes.ts";
const GATE_LINE = "await assertCompanyMembership(user.uuid, query.data.operating_company_id);";

const ROUTES = [
  ['app.get("/api/v1/accounting/trial-balance/export/pdf"', "GET /trial-balance/export/pdf"],
  ['app.get("/api/v1/accounting/trial-balance/export/xlsx"', "GET /trial-balance/export/xlsx"],
  ['app.get("/api/v1/accounting/profit-loss/export/pdf"', "GET /profit-loss/export/pdf"],
  ['app.get("/api/v1/accounting/profit-loss/export/xlsx"', "GET /profit-loss/export/xlsx"],
  ['app.get("/api/v1/accounting/balance-sheet/export/pdf"', "GET /balance-sheet/export/pdf"],
  ['app.get("/api/v1/accounting/balance-sheet/export/xlsx"', "GET /balance-sheet/export/xlsx"],
  ['app.get("/api/v1/accounting/cash-flow/export/pdf"', "GET /cash-flow/export/pdf"],
  ['app.get("/api/v1/accounting/cash-flow/export/xlsx"', "GET /cash-flow/export/xlsx"],
  ['app.get("/api/v1/accounting/ar-aging/export/pdf"', "GET /ar-aging/export/pdf"],
  ['app.get("/api/v1/accounting/ar-aging/export/xlsx"', "GET /ar-aging/export/xlsx"],
  ['app.get("/api/v1/accounting/ap-aging/export/pdf"', "GET /ap-aging/export/pdf"],
  ['app.get("/api/v1/accounting/ap-aging/export/xlsx"', "GET /ap-aging/export/xlsx"],
];
const WINDOW = 1000;

function assertAll(src) {
  const problems = [];
  for (const [needle, label] of ROUTES) {
    const idx = src.indexOf(needle);
    if (idx === -1) {
      problems.push(`${label}: route not found (guard target moved; update this guard)`);
      continue;
    }
    const window = src.slice(idx, idx + WINDOW);
    if (!window.includes(GATE_LINE)) {
      problems.push(`${label}: does not call assertCompanyMembership before generating the export`);
    }
  }
  return problems;
}

const read = () => fs.readFileSync(path.join(ROOT, FILE), "utf8");

if (SELFTEST) {
  const src = read();
  // Plant the defect on the second route (trial-balance/export/xlsx) -- the first is the one that
  // already had the check before this fix, so mutating the second proves the fix generalizes.
  const needle = 'app.get("/api/v1/accounting/trial-balance/export/xlsx"';
  const idx = src.indexOf(needle);
  if (idx === -1) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: trial-balance/export/xlsx route not found in real code`);
    process.exit(1);
  }
  const gateIdx = src.indexOf(GATE_LINE, idx);
  if (gateIdx === -1 || gateIdx - idx > WINDOW - GATE_LINE.length) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: gate line not found near trial-balance/export/xlsx (guard text drifted from real code)`);
    process.exit(1);
  }
  const lineStart = src.lastIndexOf("\n", gateIdx) + 1;
  const lineEnd = src.indexOf("\n", gateIdx) + 1;
  const planted = src.slice(0, lineStart) + src.slice(lineEnd);

  const plantedProblems = assertAll(planted);
  if (!plantedProblems.some((p) => p.startsWith("GET /trial-balance/export/xlsx"))) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect (trial-balance/export/xlsx gate dropped) not caught`);
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
console.log(`${LABEL} OK — all 12 statement-export routes assert company membership`);
