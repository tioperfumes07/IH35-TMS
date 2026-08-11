#!/usr/bin/env node
/**
 * verify-profitability-by-load-uses-paritytable — qbo-parity-a1 (Profitability By Load detail surface)
 *
 * The profitability By Load (Detail) grid must use shared ParityTable grammar
 * (sort/resize/gear), not a hand-rolled <table>. Display-only migration of a
 * placeholder surface: no query is wired on this view yet, so there is no
 * ListErrorState requirement — but columns Load ID / Lane / Miles / Revenue /
 * Cost / Margin / $/Mi, the "By Load (Detail)" heading, and the "No data loaded"
 * empty copy must state the feed is not connected (aligned with by-lane sibling guard).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-profitability-by-load-uses-paritytable";
const PAGE = "apps/frontend/src/pages/profitability/ByLoadView.tsx";
const HONEST_EMPTY = 'emptyText="Profitability feed is not connected; no figures are available for this view."';

const REQUIRED_LABELS = ["Load ID", "Lane", "Miles", "Revenue", "Cost", "Margin", "$/Mi"];

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
  if (!src.includes('storageKey="profitability-by-load"')) {
    errors.push(`${PAGE}: must set storageKey="profitability-by-load"`);
  }
  if (!src.includes('tableTestId="profitability-by-load-table"')) {
    errors.push(`${PAGE}: must set tableTestId="profitability-by-load-table"`);
  }
  if (!src.includes("By Load (Detail)")) {
    errors.push(`${PAGE}: must keep the "By Load (Detail)" heading`);
  }
  if (!src.includes(HONEST_EMPTY)) {
    errors.push(`${PAGE}: must name the disconnected profitability feed in emptyText`);
  }
  if (src.includes('emptyText="No data loaded"')) {
    errors.push(`${PAGE}: must not present the unwired feed as a successful empty query`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    const COLUMNS = [
      { key: "load_id", label: "Load ID" },
      { key: "lane", label: "Lane" },
      { key: "miles", label: "Miles" },
      { key: "revenue", label: "Revenue" },
      { key: "cost", label: "Cost" },
      { key: "margin", label: "Margin" },
      { key: "per_mile", label: "$/Mi" },
    ];
    <h3>By Load (Detail)</h3>
    <ParityTable
      storageKey="profitability-by-load"
      tableTestId="profitability-by-load-table"
      emptyText="Profitability feed is not connected; no figures are available for this view."
    />
  `;
  const bad = `
    export function ByLoadView() {
      return (
        <div>
          <table><thead><tr><th>Load ID</th></tr></thead></table>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable; columns + heading + empty copy preserved.`);
}

main();
