#!/usr/bin/env node
/**
 * verify-profitability-by-customer-uses-paritytable — Profitability ByCustomerView (fill-not-shell 2026-11-02).
 * Wired to getCustomerProfitability + EntityLink reverse drill. Disconnected-feed emptyText is retired.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-profitability-by-customer-uses-paritytable";
const PAGE = "apps/frontend/src/pages/profitability/ByCustomerView.tsx";
const DISCONNECTED = "Profitability feed is not connected";
const REQUIRED_LABELS = ["Customer", "Loads", "Total Margin"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes("ParityTable")) errors.push(`${PAGE}: must import/use ParityTable`);
  if ((src.match(/<ParityTable\b/g) ?? []).length < 1) errors.push(`${PAGE}: expected ≥1 <ParityTable>`);
  if (/<table[\s>]/.test(src)) errors.push(`${PAGE}: must not contain hand-rolled <table>`);
  for (const label of REQUIRED_LABELS) {
    if (!src.includes(`label: "${label}"`)) errors.push(`${PAGE}: missing column label: "${label}"`);
  }
  if (!src.includes('storageKey="profitability-by-customer"')) errors.push(`${PAGE}: storageKey`);
  if (!src.includes('tableTestId="profitability-by-customer-table"')) errors.push(`${PAGE}: tableTestId`);
  if (!src.includes("getCustomerProfitability")) errors.push(`${PAGE}: must call getCustomerProfitability`);
  if (!src.includes("EntityLinkOrTombstone")) errors.push(`${PAGE}: must reverse-drill customers`);
  if (!src.includes("BoardSection")) errors.push(`${PAGE}: must use BoardSection`);
  if (src.includes(DISCONNECTED)) errors.push(`${PAGE}: must not keep disconnected-feed emptyText (engine is wired)`);
  return errors;
}

function selftest() {
  const good = `ParityTable BoardSection getCustomerProfitability EntityLinkOrTombstone
label: "Customer" label: "Loads" label: "Total Margin"
<ParityTable storageKey="profitability-by-customer" tableTestId="profitability-by-customer-table" emptyText="No customers" />`;
  const bad = good.replace("No customers", DISCONNECTED);
  if (assertMigrated(good).length) { console.error(`${LABEL} --selftest FAIL good`, assertMigrated(good)); process.exit(1); }
  if (!assertMigrated(bad).some((e) => e.includes("disconnected"))) { console.error(`${LABEL} --selftest FAIL planted`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS`);
}

if (process.argv.includes("--selftest")) { selftest(); process.exit(0); }
const errors = assertMigrated(fs.readFileSync(path.join(ROOT, PAGE), "utf8"));
if (errors.length) { console.error(`FAIL ${LABEL}:`); for (const e of errors) console.error(`  - ${e}`); process.exit(1); }
console.log(`OK ${LABEL}: ${PAGE} ParityTable + getCustomerProfitability + BoardSection`);
