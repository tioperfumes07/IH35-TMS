#!/usr/bin/env node
// L.3 STEP-4 guard (owner order 2026-09-05): the Load Costs board carries a tab row above the KPIs —
//   Costs (default) · Expenses · Bills · Fuel advances · Broker advances · Driver pay ·
//   Repairs & maintenance · Documents
// with a count badge per tab, and the Margin column is NOT in the default column set (defaultHidden).
//
// Usage: node scripts/verify-load-costs-board-tabs.mjs [--selftest]
import { readFileSync } from "node:fs";

const BOARD = "apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx";
const TAB_LABELS = ["Costs", "Expenses", "Bills", "Fuel advances", "Broker advances", "Driver pay", "Repairs & maintenance", "Documents"];

function audit(src) {
  const f = [];
  if (!/data-testid="load-costs-tabs"/.test(src))
    f.push(`${BOARD}: the board must render a tab row (data-testid="load-costs-tabs")`);
  for (const label of TAB_LABELS) {
    if (!new RegExp(`label:\\s*"${label.replace(/[.*+?^${}()|[\]\\&]/g, "\\$&")}"`).test(src))
      f.push(`${BOARD}: board tab row is missing the "${label}" tab`);
  }
  // Costs is the default tab.
  if (!/useState<CostTab>\("costs"\)/.test(src))
    f.push(`${BOARD}: the default tab must be "costs"`);
  // Margin must be defaultHidden (not part of the default column set).
  const marginCol = src.split("\n").find((l) => l.includes('key: "margin"')) ?? "";
  if (marginCol && !/defaultHidden:\s*true/.test(marginCol))
    f.push(`${BOARD}: the Margin column must be defaultHidden (dropped from the default 19)`);
  return f;
}

function main() {
  const selftest = process.argv.includes("--selftest");
  const src = readFileSync(BOARD, "utf8");
  const failures = audit(src);
  if (failures.length) {
    console.error("FAIL verify-load-costs-board-tabs:");
    for (const x of failures) console.error(`  - ${x}`);
    process.exit(1);
  }
  if (selftest) {
    const m1 = src.replace(/label: "Broker advances"/, 'label: "Advances"');
    if (audit(m1).length === 0) { console.error("SELFTEST FAIL: renaming a tab did not trip"); process.exit(1); }
    const m2 = src.replace(/data-testid="load-costs-tabs"/, 'data-testid="load-costs-notabs"');
    if (audit(m2).length === 0) { console.error("SELFTEST FAIL: removing the tab row did not trip"); process.exit(1); }
    const m3 = src.replace(/useState<CostTab>\("costs"\)/, 'useState<CostTab>("bills")');
    if (audit(m3).length === 0) { console.error("SELFTEST FAIL: changing the default tab did not trip"); process.exit(1); }
    const m4 = src.replace(/key: "margin", label: "Margin", testId: "col-margin", sortable: true, className: NUM, defaultHidden: true/, 'key: "margin", label: "Margin", testId: "col-margin", sortable: true, className: NUM');
    if (audit(m4).length === 0) { console.error("SELFTEST FAIL: un-hiding Margin did not trip"); process.exit(1); }
    console.log("SELFTEST OK: guard trips on all mutations");
  }
  console.log("PASS verify-load-costs-board-tabs");
}

main();
