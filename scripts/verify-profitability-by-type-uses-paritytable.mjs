#!/usr/bin/env node
/**
 * verify-profitability-by-type-uses-paritytable — qbo-parity-a1 (Profitability › By Equipment Type surface)
 *
 * The profitability By Equipment Type view must use shared ParityTable grammar
 * (sort/resize/gear), not a hand-rolled <table>. The view is a static placeholder
 * (no query wired yet), so no ListErrorState is required; the empty-state copy
 * honest disconnected-feed copy is preserved (aligned with by-lane sibling guard).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-profitability-by-type-uses-paritytable";
const PAGE = "apps/frontend/src/pages/profitability/ByTypeView.tsx";
const HONEST_EMPTY = 'emptyText="Profitability feed is not connected; no figures are available for this view."';

const REQUIRED_LABELS = ["Type", "Loads", "Miles", "Rev/Mi", "Cost/Mi", "Margin/Mi", "Total Margin"];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../../components/parity/ParityTable"') &&
    !src.includes("from '../../components/parity/ParityTable'")
  ) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length < 1) {
    errors.push(`${PAGE}: expected ≥1 <ParityTable>`);
  }
  if (/<table[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <table>`);
  }
  if (/<thead[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <thead>`);
  }
  for (const label of REQUIRED_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing column label: "${label}"`);
    }
  }
  if (!src.includes('storageKey="profitability-by-type"')) {
    errors.push(`${PAGE}: must set storageKey="profitability-by-type"`);
  }
  if (!src.includes('tableTestId="profitability-by-type-table"')) {
    errors.push(`${PAGE}: must set tableTestId="profitability-by-type-table"`);
  }
  if (!src.includes(HONEST_EMPTY)) {
    errors.push(`${PAGE}: must name the disconnected profitability feed in emptyText`);
  }
  if (src.includes('emptyText="No data loaded"')) {
    errors.push(`${PAGE}: must not present the unwired feed as a successful empty query`);
  }
  if (!src.includes("By Equipment Type")) {
    errors.push(`${PAGE}: must keep the By Equipment Type heading`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    const COLUMNS = [
      { key: "equipment_type", label: "Type" },
      { key: "loads", label: "Loads" },
      { key: "miles", label: "Miles" },
      { key: "rev_per_mile", label: "Rev/Mi" },
      { key: "cost_per_mile", label: "Cost/Mi" },
      { key: "margin_per_mile", label: "Margin/Mi" },
      { key: "total_margin", label: "Total Margin" },
    ];
    <h3>By Equipment Type</h3>
    <ParityTable
      storageKey="profitability-by-type"
      tableTestId="profitability-by-type-table"
      emptyText="Profitability feed is not connected; no figures are available for this view."
    />
  `;
  const bad = `
    export function ByTypeView() {
      return (
        <div>
          <table><thead><tr><th>Type</th></tr></thead></table>
        </div>
      );
    }
  `;
  const goodErrors = assertMigrated(good);
  const badErrors = assertMigrated(bad);
  if (goodErrors.length) {
    console.error(`${LABEL} --selftest FAIL good fixture:`, goodErrors);
    process.exit(1);
  }
  if (badErrors.length < 3) {
    console.error(`${LABEL} --selftest FAIL bad fixture should fail hard:`, badErrors);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  const errors = assertMigrated(src);
  if (errors.length) {
    console.error(`FAIL ${LABEL}:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable; columns + empty copy preserved.`);
}

main();
