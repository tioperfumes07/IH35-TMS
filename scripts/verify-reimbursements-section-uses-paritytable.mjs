#!/usr/bin/env node
/**
 * verify-reimbursements-section-uses-paritytable — qbo-parity-a1 (driver-finance
 * settlement detail "C. Reimbursements" section)
 *
 * The settlement-detail Reimbursements section grid must use shared ParityTable
 * grammar (sort/resize/gear), not a hand-rolled <table>. Financial surface —
 * owner-greenlit DISPLAY-ONLY migration of a READ-ONLY props-fed line list (no
 * posting/mutation logic; amounts arrive precomputed via props). Columns
 * Date / Description / Receipt # / Amount, the "C. Reimbursements" heading, the
 * receipt link button, canonical money formatting (formatUsd), and the Subtotal
 * footer line must be preserved 1:1.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-reimbursements-section-uses-paritytable";
const PAGE = "apps/frontend/src/pages/driver-finance/components/ReimbursementsSection.tsx";
const EXTRA = "apps/frontend/src/pages/driver-finance/components/ExtraPaySection.tsx";

const REQUIRED_LABELS = ["Date", "Receipt", "Amount"];

function assertFormatUsd(src, file) {
  const errors = [];
  // Codex batch90 — token-only formatUsd() is insufficient; row Amount + Subtotal must render through it.
  if (!/formatUsd\(\s*line\.amount\s*\)/.test(src)) {
    errors.push(`${file}: Amount column must render formatUsd(line.amount)`);
  }
  if (!/Subtotal:\s*\{?\s*formatUsd\(\s*subtotal\s*\)/.test(src)) {
    errors.push(`${file}: Subtotal must render formatUsd(subtotal)`);
  }
  if (/\.toFixed\(2\)/.test(src)) errors.push(`${file}: must not use ad-hoc toFixed(2) money formatting`);
  return errors;
}

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
  if (!src.includes('storageKey="driver-finance-reimbursements-section"')) {
    errors.push(`${PAGE}: must set storageKey="driver-finance-reimbursements-section"`);
  }
  if (!src.includes('tableTestId="driver-finance-reimbursements-table"')) {
    errors.push(`${PAGE}: must set tableTestId="driver-finance-reimbursements-table"`);
  }
  if (!/C\.\s*Reimbursements|Reimbursements<\/h2>|title="Reimbursements"/.test(src)) {
    errors.push(`${PAGE}: must keep the Reimbursements heading`);
  }
  if (!src.includes("Subtotal:")) {
    errors.push(`${PAGE}: must keep the Subtotal footer line`);
  }
  errors.push(...assertFormatUsd(src, PAGE));
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
    const COLUMNS = [
      { key: "date", label: "Date" },
      { key: "receipt", label: "Receipt", render: (line) => <button>{line.receipt}</button> },
      { key: "amount", label: "Amount", render: (line) => formatUsd(line.amount) },
    ];
    <BoardSection title="Reimbursements" />
    <ParityTable
      storageKey="driver-finance-reimbursements-section"
      tableTestId="driver-finance-reimbursements-table"
    />
    <div>Subtotal: {formatUsd(subtotal)}</div>
  `;
  const bad = `
    export function ReimbursementsSection() {
      return (
        <section>
          <table><thead><tr><th>Date</th></tr></thead></table>
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
  // batch90 plant: formatUsd imported/called elsewhere but row+subtotal stay raw → must fail.
  const tokenOnly = good
    .replace("render: (line) => formatUsd(line.amount)", "render: (line) => String(line.amount)")
    .replace("Subtotal: {formatUsd(subtotal)}", "Subtotal: {String(subtotal)}")
    .replace(
      'import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";',
      'import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";\n    const _keep = formatUsd;',
    );
  const tokenErrors = assertFormatUsd(tokenOnly, PAGE);
  if (tokenErrors.length < 2) {
    console.error(`${LABEL} --selftest FAIL token-only plant should catch row+subtotal:`, tokenErrors);
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
  const extra = fs.readFileSync(path.join(ROOT, EXTRA), "utf8");
  const errors = [...assertMigrated(src), ...assertFormatUsd(extra, EXTRA)];
  if (errors.length) {
    console.error(`FAIL ${LABEL}:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(
    `OK ${LABEL}: ${PAGE} uses ParityTable; Reimbursements + Extra Pay use formatUsd.`,
  );
}

main();
