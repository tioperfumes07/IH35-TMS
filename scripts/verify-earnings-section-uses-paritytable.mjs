#!/usr/bin/env node
/**
 * verify-earnings-section-uses-paritytable — qbo-parity-a1 (EarningsSection surface)
 *
 * Driver-finance settlement EarningsSection must use the shared ParityTable grammar
 * (sort/resize/gear), not a hand-rolled <table>. Display-only surface (lines passed in
 * as props; no query/mutation in this component — the parent settlement page owns fetch
 * and error state). Columns per the owner reference design (see the 443.99 note below);
 * $X.XX amount formatting, em-dash fallbacks for Miles/Rate, and the Subtotal/Miles
 * footer line preserved.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-earnings-section-uses-paritytable";
const PAGE = "apps/frontend/src/pages/driver-finance/components/EarningsSection.tsx";

// 443.99 (CC-2) — old rule: columns Load / Source / Description / Miles / Rate / Amount; amount via
//   `${Number(line.amount).toFixed(2)}`; `line.miles ?? "—"` / `line.rate ?? "—"`; footer `Subtotal: ${subtotal.toFixed(2)}`
//   and `Miles: {totalMiles}`.
// new rule: the owner reference design's columns (docs/design/reference/DRIVER-SETTLEMENT-DETAIL-REFERENCE-2026-09-05.html)
//   Number / Load # / Settlement/Tour / Date / From / To / Loaded mi / Rate / Amount / Driver bill; amount, rate,
//   subtotal through lib/money (formatUsdTable / formatUsdRateTable); miles through formatQuantityTable; an unknown
//   miles or rate renders "—", never 0; the SRC-02 source (source_label) is shown and the Driver bill links to the bill.
// why: L5 (c216a767e3) rebuilt this table to the reference design, ALL-SEATS law (2026-09-13) added Settlement/Tour,
//   and ROUND 296 (ACCT-F9799, e5680e1c36) moved every driver-finance money cell onto lib/money. The page was right;
//   the anchors were stale. Not looser: 10 required columns (was 6), and every behaviour the old rule protected —
//   $ formatting, em-dash for unknown miles/rate, Subtotal + Miles footer, SRC-02 source — is still asserted.
const REQUIRED_LABELS = ["Number", "Load #", "Settlement/Tour", "Date", "From", "To", "Loaded mi", "Rate", "Amount", "Driver bill"];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../../../components/parity/ParityTable"') &&
    !src.includes("from '../../../components/parity/ParityTable'")
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
  if (!src.includes('storageKey="driver-finance-earnings-section"')) {
    errors.push(`${PAGE}: must set storageKey="driver-finance-earnings-section"`);
  }
  if (!src.includes('tableTestId="earnings-section-table"')) {
    errors.push(`${PAGE}: must set tableTestId="earnings-section-table"`);
  }
  if (!src.includes("formatUsdTable(line.amount)")) {
    errors.push(`${PAGE}: must keep $X.XX amount rendering (formatUsdTable(line.amount), lib/money)`);
  }
  if (
    !/line\.miles != null \?[\s\S]{0,120}formatQuantityTable\(line\.miles[\s\S]{0,160}—/.test(src) ||
    !/line\.rate != null \?[\s\S]{0,120}formatUsdRateTable\(line\.rate\)[\s\S]{0,160}—/.test(src)
  ) {
    errors.push(`${PAGE}: must keep em-dash fallback for Miles and Rate (unknown is "—", never 0)`);
  }
  if (!src.includes("Subtotal: {formatUsdTable(subtotal)}")) {
    errors.push(`${PAGE}: must keep Subtotal footer line (formatUsdTable)`);
  }
  if (!/Miles: \{formatQuantityTable\(totalMiles/.test(src)) {
    errors.push(`${PAGE}: must keep total Miles footer segment`);
  }
  if (!/line\.source_label/.test(src)) {
    errors.push(`${PAGE}: must expose the SRC-02 source (source_label) for settlement earnings lines`);
  }
  if (!/<EntityLink kind="driver_bill" id=\{line\.source_driver_bill_id\}/.test(src)) {
    errors.push(`${PAGE}: Driver bill column must drill to the source driver bill (SRC-02)`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
    const COLUMNS = [
      { key: "source_label", label: "Number", render: (line) => line.source_label ?? "—" },
      { key: "load_id", label: "Load #" },
      { key: "settlement_ref", label: "Settlement/Tour" },
      { key: "line_date", label: "Date" },
      { key: "origin", label: "From" },
      { key: "dest", label: "To" },
      { key: "miles", label: "Loaded mi", render: (line) => line.miles != null ? (<>{formatQuantityTable(line.miles, 1)}</>) : (<span>—</span>) },
      { key: "rate", label: "Rate", render: (line) => line.rate != null ? (<>{formatUsdRateTable(line.rate)}</>) : (<span>—</span>) },
      { key: "amount", label: "Amount", render: (line) => <>{formatUsdTable(line.amount)}</> },
      { key: "source_driver_bill_id", label: "Driver bill", render: (line) => <EntityLink kind="driver_bill" id={line.source_driver_bill_id} label={line.source_label} /> },
    ];
    <ParityTable
      storageKey="driver-finance-earnings-section"
      tableTestId="earnings-section-table"
    />
    <div>Subtotal: {formatUsdTable(subtotal)} · Miles: {formatQuantityTable(totalMiles, 1)}</div>
  `;
  const bad = `
    export function EarningsSection() {
      return (
        <section>
          <table><thead><tr><th>Load</th></tr></thead></table>
        </section>
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
  const planted = [
    ["unknown miles rendered as 0", good.replace(/line\.miles != null \? \(<>\{formatQuantityTable\(line\.miles, 1\)\}<\/>\) : \(<span>—<\/span>\)/, "formatQuantityTable(line.miles ?? 0, 1)")],
    ["amount not through lib/money", good.replace("formatUsdTable(line.amount)", "Number(line.amount).toFixed(2)")],
    ["Subtotal footer dropped", good.replace("Subtotal: {formatUsdTable(subtotal)}", "")],
    ["Driver bill no longer drills", good.replace('<EntityLink kind="driver_bill" id={line.source_driver_bill_id}', "<span")],
    ["Settlement/Tour column dropped", good.replace('label: "Settlement/Tour"', 'label: "Tour"')],
  ];
  for (const [name, src] of planted) {
    if (!assertMigrated(src).length) {
      console.error(`${LABEL} --selftest FAIL planted regression escaped: ${name}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS (${planted.length}/${planted.length} planted regressions caught)`);
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable; reference-design columns, lib/money, em-dash fallbacks and footer preserved.`);
}

main();
