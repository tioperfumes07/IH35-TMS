#!/usr/bin/env node
/**
 * verify-profitability-by-lane-uses-paritytable — Profitability ByLaneView (fill-not-shell 2026-11-02).
 * Must use ParityTable + BoardSection + getLaneProfitability. Empty copy is period-empty, never
 * "feed is not connected" (that stub is retired).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-profitability-by-lane-uses-paritytable";
const PAGE = "apps/frontend/src/pages/profitability/ByLaneView.tsx";
const DISCONNECTED = "Profitability feed is not connected";
const REQUIRED_LABELS = ["Lane", "Loads", "Miles", "Rev/Mi", "Cost/Mi", "Margin/Mi", "Total Margin"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes("ParityTable")) errors.push(`${PAGE}: must import/use ParityTable`);
  if ((src.match(/<ParityTable\b/g) ?? []).length < 1) errors.push(`${PAGE}: expected ≥1 <ParityTable>`);
  if (/<table[\s>]/.test(src)) errors.push(`${PAGE}: must not contain hand-rolled <table>`);
  for (const label of REQUIRED_LABELS) {
    if (!src.includes(`label: "${label}"`)) errors.push(`${PAGE}: missing column label: "${label}"`);
  }
  if (!src.includes('storageKey="profitability-by-lane"')) errors.push(`${PAGE}: storageKey profitability-by-lane`);
  if (!src.includes('tableTestId="profitability-by-lane-table"')) errors.push(`${PAGE}: tableTestId profitability-by-lane-table`);
  if (!src.includes("getLaneProfitability")) errors.push(`${PAGE}: must call getLaneProfitability`);
  if (!src.includes("BoardSection")) errors.push(`${PAGE}: must use BoardSection`);
  if (src.includes(DISCONNECTED)) errors.push(`${PAGE}: must not keep disconnected-feed emptyText (engine is wired)`);
  if (/useMutation|axios\.(post|put|patch|delete)/.test(src)) errors.push(`${PAGE}: display-only — no mutations`);
  return errors;
}

function selftest() {
  const good = `import { ParityTable } from "../../components/parity/ParityTable";
BoardSection getLaneProfitability
const COLUMNS = [{label: "Lane"},{label: "Loads"},{label: "Miles"},{label: "Rev/Mi"},{label: "Cost/Mi"},{label: "Margin/Mi"},{label: "Total Margin"}];
<ParityTable storageKey="profitability-by-lane" tableTestId="profitability-by-lane-table" emptyText="No lanes in this period" />`;
  const badDisconnected = good.replace("No lanes in this period", DISCONNECTED + "; no figures");
  const badTable = `<table><thead><tr><th>Lane</th></tr></thead></table>`;
  if (assertMigrated(good).length) { console.error(`${LABEL} --selftest FAIL good`, assertMigrated(good)); process.exit(1); }
  if (!assertMigrated(badDisconnected).some((e) => e.includes("disconnected"))) { console.error(`${LABEL} --selftest FAIL planted disconnected`); process.exit(1); }
  if (assertMigrated(badTable).length < 3) { console.error(`${LABEL} --selftest FAIL planted table`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS`);
}

if (process.argv.includes("--selftest")) { selftest(); process.exit(0); }
const errors = assertMigrated(fs.readFileSync(path.join(ROOT, PAGE), "utf8"));
if (errors.length) { console.error(`FAIL ${LABEL}:`); for (const e of errors) console.error(`  - ${e}`); process.exit(1); }
console.log(`OK ${LABEL}: ${PAGE} ParityTable + getLaneProfitability + BoardSection`);
