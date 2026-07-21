#!/usr/bin/env node
/**
 * verify-oem-parts-catalog-uses-paritytable — qbo-parity-a1 (OemPartsCatalog surface)
 *
 * The Lists → Maintenance → OEM Parts Reference catalog must use shared ParityTable
 * grammar (sort/resize/gear), not a hand-rolled <table>. Query failures must keep
 * surfacing ListErrorBanner + Retry (never a silent empty table). Columns Brand /
 * OEM Part # / Name / Category / Default Supplier / Typical Cost preserved; the
 * $-formatted typical-cost display (formatCost) and empty copy preserved. Display-only
 * migration — the create modal and catalog CRUD client are untouched.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-oem-parts-catalog-uses-paritytable";
const PAGE = "apps/frontend/src/pages/lists/maintenance/OemPartsCatalog.tsx";

const REQUIRED_LABELS = [
  "Brand",
  "OEM Part #",
  "Name",
  "Category",
  "Default Supplier",
  "Typical Cost",
];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../../../components/parity/ParityTable"') &&
    !src.includes("from '../../../components/parity/ParityTable'")
  ) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (!src.includes("ListErrorBanner")) {
    errors.push(`${PAGE}: must keep ListErrorBanner on list query failure`);
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
  if (!src.includes("formatCost(row.unit_cost_usd_typical)")) {
    errors.push(`${PAGE}: must keep formatCost() $-display for Typical Cost`);
  }
  if (!src.includes('storageKey="lists-oem-parts-catalog"')) {
    errors.push(`${PAGE}: must set storageKey="lists-oem-parts-catalog"`);
  }
  if (!src.includes('tableTestId="oem-parts-catalog-table"')) {
    errors.push(`${PAGE}: must set tableTestId="oem-parts-catalog-table"`);
  }
  if (!src.includes("No OEM part templates found.")) {
    errors.push(`${PAGE}: must keep emptyText for empty catalog`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
    import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
    const COLUMNS = [
      { key: "brand", label: "Brand" },
      { key: "oem_part_number", label: "OEM Part #" },
      { key: "part_name", label: "Name" },
      { key: "category", label: "Category" },
      { key: "default_supplier", label: "Default Supplier" },
      { key: "unit_cost_usd_typical", label: "Typical Cost", render: (row) => formatCost(row.unit_cost_usd_typical) },
    ];
    <ListErrorBanner onRetry={() => {}} />
    <ParityTable
      storageKey="lists-oem-parts-catalog"
      tableTestId="oem-parts-catalog-table"
      emptyText="No OEM part templates found."
    />
  `;
  const bad = `
    export function OemPartsCatalog() {
      return (
        <div>
          <table><thead><tr><th>Brand</th></tr></thead></table>
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable + ListErrorBanner; columns preserved.`);
}

main();
