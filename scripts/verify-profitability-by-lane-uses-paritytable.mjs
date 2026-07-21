#!/usr/bin/env node
/**
 * verify-profitability-by-lane-uses-paritytable — qbo-parity-a1 (Profitability ByLaneView surface)
 *
 * Financial surface — display-only migration. The profitability By Lane grid must use
 * shared ParityTable grammar (sort/resize/gear), not a hand-rolled <table>. Static
 * display-only stub (no query wired yet → no ListErrorState path). Columns Lane /
 * Loads / Miles / Rev/Mi / Cost/Mi / Margin/Mi / Total Margin preserved in order;
 * "No data loaded" empty copy preserved. No posting/mutation logic may appear.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-profitability-by-lane-uses-paritytable";
const PAGE = "apps/frontend/src/pages/profitability/ByLaneView.tsx";

const REQUIRED_LABELS = ["Lane", "Loads", "Miles", "Rev/Mi", "Cost/Mi", "Margin/Mi", "Total Margin"];

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
  if (!src.includes('storageKey="profitability-by-lane"')) {
    errors.push(`${PAGE}: must set storageKey="profitability-by-lane"`);
  }
  if (!src.includes('tableTestId="profitability-by-lane-table"')) {
    errors.push(`${PAGE}: must set tableTestId="profitability-by-lane-table"`);
  }
  if (!src.includes('emptyText="No data loaded"')) {
    errors.push(`${PAGE}: must keep emptyText "No data loaded"`);
  }
  // Display-only financial surface: no mutation/posting logic may creep in.
  if (/useMutation|axios\.(post|put|patch|delete)|api\.(post|put|patch|delete)/.test(src)) {
    errors.push(`${PAGE}: display-only surface must not contain mutation/write calls`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    const COLUMNS = [
      { key: "lane", label: "Lane" },
      { key: "loads", label: "Loads" },
      { key: "miles", label: "Miles" },
      { key: "revPerMile", label: "Rev/Mi" },
      { key: "costPerMile", label: "Cost/Mi" },
      { key: "marginPerMile", label: "Margin/Mi" },
      { key: "totalMargin", label: "Total Margin" },
    ];
    <ParityTable
      storageKey="profitability-by-lane"
      tableTestId="profitability-by-lane-table"
      emptyText="No data loaded"
    />
  `;
  const bad = `
    export function ByLaneView() {
      return (
        <div>
          <table><thead><tr><th>Lane</th></tr></thead></table>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable; columns + empty copy preserved; display-only.`);
}

main();
