#!/usr/bin/env node
/**
 * verify-unit-parts-history-uses-paritytable — parity migration wave (UnitPartsHistorySection surface)
 *
 * Vehicle profile "Parts Used" reverse drill-through (WO parts consumption via
 * parts_invoice_links) must use shared ParityTable grammar (sort/resize/gear), not a
 * hand-rolled <table>. Load failures must surface ListErrorState (never false-empty
 * "No parts linked" on failure).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-unit-parts-history-uses-paritytable";
const PAGE = "apps/frontend/src/components/vehicle-profile/UnitPartsHistorySection.tsx";

const REQUIRED_LABELS = ["When", "Work Order", "Part", "Qty", "Vendor", "Invoice", "Amount"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../parity/ParityTable"') && !src.includes("from '../parity/ParityTable'")) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on load failure`);
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
  if (!src.includes('tableTestId="unit-parts-history-table"')) {
    errors.push(`${PAGE}: must keep tableTestId="unit-parts-history-table"`);
  }
  if (!src.includes("`unit-parts-row-${row.id}`")) {
    errors.push(`${PAGE}: must keep per-row testid unit-parts-row-\${row.id}`);
  }
  if (!src.includes('data-testid="vp-section-parts-used"')) {
    errors.push(`${PAGE}: must keep vp-section-parts-used container testid`);
  }
  if (!src.includes("No parts linked to work orders for this unit.")) {
    errors.push(`${PAGE}: must keep emptyText for empty parts history`);
  }
  if (!src.includes("Couldn't load parts used on this unit")) {
    errors.push(`${PAGE}: must keep ListErrorState title for load failure`);
  }
  if (!src.includes("View all assignments")) {
    errors.push(`${PAGE}: must keep the "View all assignments" drill-through link`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../ListErrorState";
    import { ParityTable, type ParityColumn } from "../parity/ParityTable";
    <Link to="/inventory/assignments">View all assignments</Link>
    <ListErrorState title="Couldn't load parts used on this unit" status={0} onRetry={() => {}} />
    <ParityTable
      tableTestId="unit-parts-history-table"
      rowTestId={(row) => \`unit-parts-row-\${row.id}\`}
      emptyText="No parts linked to work orders for this unit."
      columns={[
        { key: "created_at", label: "When" },
        { key: "work_order_id", label: "Work Order" },
        { key: "part_description", label: "Part" },
        { key: "qty_used", label: "Qty" },
        { key: "vendor_name", label: "Vendor" },
        { key: "vendor_invoice_number", label: "Invoice" },
        { key: "vendor_invoice_amount", label: "Amount" },
      ]}
    />
    <section data-testid="vp-section-parts-used" />
  `;
  const bad = `
    export function UnitPartsHistorySection() {
      return (
        <div>
          <table data-testid="unit-parts-history-table"><thead><tr><th>When</th></tr></thead></table>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable + ListErrorState; columns + unit-parts-history-table testid preserved.`);
}

main();
