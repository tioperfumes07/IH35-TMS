#!/usr/bin/env node
/** @matrix-built {"modules":["reports"],"cols":["gl_je"],"leafRe":"^report\\.management$","task":"REPORTS-GL-JE-FINAL-LEAVES","vertical":"column-wave"} */
import fs from "node:fs";
const LABEL = "verify-reports-gl-je-final-leaves";
const files = {
  required: "docs/specs/scoreboard/modules/reports.required.json",
  management: "apps/frontend/src/pages/reports/ManagementReportPackagePage.tsx",
  pnl: "apps/backend/src/accounting/profit-loss.service.ts",
  balance: "apps/backend/src/accounting/balance-sheet.service.ts",
  settlementRoute: "apps/backend/src/reports/settlement-summary.routes.ts",
  settlementView: "apps/frontend/src/pages/reports/SettlementSummaryPage.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
function audit(s) {
  const failures = [];
  const required = JSON.parse(s.required);
  const leaves = new Map(required.leaves.map((leaf) => [leaf.id, leaf]));
  if (!(leaves.get("report.management")?.required || []).includes("gl_je")) failures.push("management must keep gl_je");
  if ((leaves.get("report.settlement_summary")?.required || []).includes("gl_je")) failures.push("settlement summary must not require gl_je");
  if (!/getProfitLossReport/.test(s.management) || !/getBalanceSheetReport/.test(s.management)) failures.push("management package GL statement APIs missing");
  if (!/JOIN accounting\.journal_entries je/.test(s.pnl)) failures.push("P&L canonical JE source missing");
  if ((s.balance.match(/JOIN accounting\.journal_entries je/g) || []).length < 2) failures.push("balance sheet canonical JE sources missing");
  if (/accounting\.journal_entries|journal_entry_id|kind="journal_entry"/.test(s.settlementRoute + s.settlementView)) failures.push("settlement summary gained JE semantics; re-scope and wire it");
  if (!/driver_finance\.driver_settlements/.test(s.settlementRoute) || !/driver_finance\.driver_settlement_deductions/.test(s.settlementRoute)) failures.push("settlement subledger source changed");
  return failures;
}
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["management-required", "required", /("id": "report\.management"[\s\S]*?)\s*"gl_je",/, "$1"],
    // REPORTS-GL-JE-SETTLEMENT-SELFTEST-DRIFT (2026-08-15): "vendor" was legitimately dropped from
    // report.settlement_summary's Required array by an honesty_audit entry (reports.required.json,
    // "removed": ["vendor"]) after this mutation was written — the old anchor no longer exists
    // anywhere in the file, so the .replace() was a silent no-op and the mutation-proof check
    // (candidate === source) tripped a false SELFTEST FAIL. Re-anchored to "settlement", the current
    // last element of that leaf's Required array (verified live against the current file) — the
    // no-single-JE rule this mutation proves (settlement summary must never require gl_je) is
    // unchanged.
    ["settlement-required", "required", /("id": "report\.settlement_summary"[\s\S]*?"required": \[[\s\S]*?"settlement")/, '$1,\n        "gl_je"'],
    ["management-pnl", "management", /getProfitLossReport/g, "missingProfitLoss"],
    ["management-bs", "management", /getBalanceSheetReport/g, "missingBalanceSheet"],
    ["pnl-je", "pnl", /JOIN accounting\.journal_entries je/g, "JOIN accounting.invoices je"],
    ["bs-je", "balance", /JOIN accounting\.journal_entries je/g, "JOIN accounting.invoices je"],
    ["settlement-je", "settlementRoute", /export async function/, "const journal_entry_id = null; export async function"],
    ["settlements", "settlementRoute", /driver_finance\.driver_settlements/g, "missing.settlements"],
    ["deductions", "settlementRoute", /driver_finance\.driver_settlement_deductions/g, "missing.deductions"],
    ["management-both", "management", /getProfitLossReport|getBalanceSheetReport/g, "missingReport"],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const candidate = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (candidate[key] === source[key] || audit(candidate).length === 0) { console.error(`${LABEL} SELFTEST FAIL — ${name}`); process.exit(1); }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`); process.exit(0);
}
const failures = audit(source);
if (failures.length) { console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log(`${LABEL} PASS — management is canonical-GL-backed; settlement summary remains honest subledger economics`);
