#!/usr/bin/env node
/**
 * verify-profitability-by-type-uses-paritytable — Profitability ByTypeView (fill-not-shell 2026-11-02).
 * Wired to getEquipmentTypeProfitability. Disconnected-feed emptyText is retired.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-profitability-by-type-uses-paritytable";
const PAGE = "apps/frontend/src/pages/profitability/ByTypeView.tsx";
const DISCONNECTED = "Profitability feed is not connected";
const REQUIRED_LABELS = ["Type", "Loads", "Miles", "Rev/Mi", "Cost/Mi", "Margin/Mi", "Total Margin"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes("ParityTable")) errors.push(`${PAGE}: must import/use ParityTable`);
  if ((src.match(/<ParityTable\b/g) ?? []).length < 1) errors.push(`${PAGE}: expected ≥1 <ParityTable>`);
  if (/<table[\s>]/.test(src)) errors.push(`${PAGE}: must not contain hand-rolled <table>`);
  for (const label of REQUIRED_LABELS) {
    if (!src.includes(`label: "${label}"`)) errors.push(`${PAGE}: missing column label: "${label}"`);
  }
  if (!src.includes('storageKey="profitability-by-type"')) errors.push(`${PAGE}: storageKey`);
  if (!src.includes('tableTestId="profitability-by-type-table"')) errors.push(`${PAGE}: tableTestId`);
  if (!src.includes("getEquipmentTypeProfitability")) errors.push(`${PAGE}: must call getEquipmentTypeProfitability`);
  if (!src.includes("BoardSection")) errors.push(`${PAGE}: must use BoardSection`);
  if (src.includes(DISCONNECTED)) errors.push(`${PAGE}: must not keep disconnected-feed emptyText (engine is wired)`);
  return errors;
}

function selftest() {
  const good = `ParityTable BoardSection getEquipmentTypeProfitability
label: "Type" label: "Loads" label: "Miles" label: "Rev/Mi" label: "Cost/Mi" label: "Margin/Mi" label: "Total Margin"
<ParityTable storageKey="profitability-by-type" tableTestId="profitability-by-type-table" emptyText="No loads" />`;
  const bad = good.replace("No loads", DISCONNECTED);
  if (assertMigrated(good).length) { console.error(`${LABEL} --selftest FAIL good`, assertMigrated(good)); process.exit(1); }
  if (!assertMigrated(bad).some((e) => e.includes("disconnected"))) { console.error(`${LABEL} --selftest FAIL planted`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS`);
}

if (process.argv.includes("--selftest")) { selftest(); process.exit(0); }
const errors = assertMigrated(fs.readFileSync(path.join(ROOT, PAGE), "utf8"));
if (errors.length) { console.error(`FAIL ${LABEL}:`); for (const e of errors) console.error(`  - ${e}`); process.exit(1); }
console.log(`OK ${LABEL}: ${PAGE} ParityTable + getEquipmentTypeProfitability + BoardSection`);
