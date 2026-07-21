#!/usr/bin/env node
/**
 * verify-driver-catalog-list-uses-paritytable — qbo-parity-a1 (driver catalog list pages)
 *
 * The shared DriverCatalogListPage (all Lists → Driver catalogs) must use the shared
 * ParityTable grammar (sort/resize/gear), not a hand-rolled <table>. Query failures must
 * keep the ListErrorBanner + Retry surface (never a silent empty table). Columns
 * Code / Display Name / Description / Order / Status preserved in order; status pill,
 * row-click edit modal, and empty copy preserved. Display-only migration — no API,
 * query-key, or mutation change.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-catalog-list-uses-paritytable";
const PAGE = "apps/frontend/src/pages/lists/driver/DriverCatalogListPage.tsx";

const REQUIRED_LABELS = ["Code", "Display Name", "Description", "Order", "Status"];

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
  if (!src.includes('storageKey="driver-catalog-list"')) {
    errors.push(`${PAGE}: must set storageKey="driver-catalog-list"`);
  }
  if (!src.includes('tableTestId="driver-catalog-list-table"')) {
    errors.push(`${PAGE}: must set tableTestId="driver-catalog-list-table"`);
  }
  if (!src.includes("statusPillClass")) {
    errors.push(`${PAGE}: must keep the Active/Inactive status pill`);
  }
  if (!src.includes("found.")) {
    errors.push(`${PAGE}: must keep the "No … found." emptyText`);
  }
  if (!src.includes("onRowClick")) {
    errors.push(`${PAGE}: must keep row-click → edit modal`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
    import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
    function statusPillClass(isActive) { return ""; }
    const COLUMNS = [
      { key: "code", label: "Code" },
      { key: "display_name", label: "Display Name" },
      { key: "description", label: "Description" },
      { key: "sort_order", label: "Order" },
      { key: "is_active", label: "Status" },
    ];
    <ListErrorBanner onRetry={() => {}} />
    <ParityTable
      storageKey="driver-catalog-list"
      tableTestId="driver-catalog-list-table"
      emptyText={\`No \${displayName.toLowerCase()} found.\`}
      onRowClick={(row) => {}}
    />
  `;
  const bad = `
    export function DriverCatalogListPage() {
      return (
        <div>
          <table><thead><tr><th>Code</th></tr></thead></table>
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
