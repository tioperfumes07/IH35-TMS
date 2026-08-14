#!/usr/bin/env node
import fs from "node:fs";

const revenue = fs.readFileSync("apps/frontend/src/pages/accounting/RevenueRecognitionPage.tsx", "utf8");
const forecast = fs.readFileSync("apps/frontend/src/pages/cash-flow/tabs/ManualDailyProjectionsTab.tsx", "utf8");
const forecastApi = fs.readFileSync("apps/frontend/src/api/forecast.ts", "utf8");
const readMatrix = (module) => JSON.parse(fs.readFileSync(`docs/specs/scoreboard/modules/${module}.required.json`, "utf8"));
const hasColumn = (matrix, leafId) => matrix.leaves.find((leaf) => leaf.id === leafId)?.required?.includes("invoice") === true;

function failures(accounting = readMatrix("accounting"), cashFlow = readMatrix("cash-flow")) {
  return [
    ["leakage invoice N/A", !hasColumn(accounting, "accounting.panel.leakage")],
    ["projection invoice N/A", !hasColumn(cashFlow, "cash-flow.panel.projection")],
    ["leakage proves missing bill latch", revenue.includes('gap === "missing_earn" ? "Missing earn latch" : "Earn without bill latch"')],
    ["projection labels operator reference", forecast.includes('{ key: "invoice_no", label: "Invoice"') && forecast.includes('invoice_no: form.invoice_no || null')],
    ["projection API has no invoice FK", forecastApi.includes("invoice_no") && !forecastApi.includes("invoice_id")],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const accounting = readMatrix("accounting");
  accounting.leaves.find((leaf) => leaf.id === "accounting.panel.leakage").required.push("invoice");
  if (!failures(accounting).includes("leakage invoice N/A")) process.exit(1);
  console.log("verify-invoice-inline-surface-applicability selftest PASS — false invoice requirement mutation red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-invoice-inline-surface-applicability FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-invoice-inline-surface-applicability PASS — both exact leaves are pre-invoice/operator-reference surfaces; no FK invented");
