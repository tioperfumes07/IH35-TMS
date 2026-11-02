#!/usr/bin/env node
/**
 * verify-profitability-by-load-uses-paritytable — Profitability ByLoadView (fill-not-shell 2026-11-02).
 * Wired to getTripProfitability + EntityLink reverse drills. Disconnected-feed emptyText is retired.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-profitability-by-load-uses-paritytable";
const PAGE = "apps/frontend/src/pages/profitability/ByLoadView.tsx";
const DISCONNECTED = "Profitability feed is not connected";
const REQUIRED_LABELS = ["Load", "Driver", "Settlement", "Revenue", "Cost", "Margin"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes("ParityTable")) errors.push(`${PAGE}: must import/use ParityTable`);
  if ((src.match(/<ParityTable\b/g) ?? []).length < 1) errors.push(`${PAGE}: expected ≥1 <ParityTable>`);
  if (/<table[\s>]/.test(src)) errors.push(`${PAGE}: must not contain hand-rolled <table>`);
  for (const label of REQUIRED_LABELS) {
    if (!src.includes(`label: "${label}"`)) errors.push(`${PAGE}: missing column label: "${label}"`);
  }
  if (!src.includes('storageKey="profitability-by-load"')) errors.push(`${PAGE}: storageKey`);
  if (!src.includes('tableTestId="profitability-by-load-table"')) errors.push(`${PAGE}: tableTestId`);
  if (!src.includes("getTripProfitability")) errors.push(`${PAGE}: must call getTripProfitability`);
  if (!src.includes("EntityLinkOrTombstone")) errors.push(`${PAGE}: must reverse-drill load/driver/settlement`);
  if (!src.includes("BoardSection")) errors.push(`${PAGE}: must use BoardSection`);
  if (src.includes(DISCONNECTED)) errors.push(`${PAGE}: must not keep disconnected-feed emptyText (engine is wired)`);
  return errors;
}

function selftest() {
  const good = `ParityTable BoardSection getTripProfitability EntityLinkOrTombstone
label: "Load" label: "Driver" label: "Settlement" label: "Revenue" label: "Cost" label: "Margin"
<ParityTable storageKey="profitability-by-load" tableTestId="profitability-by-load-table" emptyText="No settlements" />`;
  const bad = good.replace("No settlements", DISCONNECTED);
  if (assertMigrated(good).length) { console.error(`${LABEL} --selftest FAIL good`, assertMigrated(good)); process.exit(1); }
  if (!assertMigrated(bad).some((e) => e.includes("disconnected"))) { console.error(`${LABEL} --selftest FAIL planted`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS`);
}

if (process.argv.includes("--selftest")) { selftest(); process.exit(0); }
const errors = assertMigrated(fs.readFileSync(path.join(ROOT, PAGE), "utf8"));
if (errors.length) { console.error(`FAIL ${LABEL}:`); for (const e of errors) console.error(`  - ${e}`); process.exit(1); }
console.log(`OK ${LABEL}: ${PAGE} ParityTable + getTripProfitability + BoardSection`);
