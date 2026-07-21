#!/usr/bin/env node
/**
 * verify-dispatch-catalog-list-uses-paritytable — qbo-parity-a1 (DispatchCatalogListPage surface)
 *
 * The shared dispatch-catalog list page (Lists & Catalogs → Dispatch → *) must use the
 * shared ParityTable grammar (sort/resize/gear), not a hand-rolled <table>. Query
 * failures must surface ListErrorState + Retry (never a silent empty table). Columns
 * Code / Display Name / Desc / Order / Status preserved 1:1; row-click opens the edit
 * modal exactly as before; status pill and empty copy preserved. Display-only migration:
 * no mutation/posting logic may change.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-dispatch-catalog-list-uses-paritytable";
const PAGE = "apps/frontend/src/pages/lists/dispatch/DispatchCatalogListPage.tsx";

const REQUIRED_LABELS = ["Code", "Display Name", "Desc", "Order", "Status"];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../../../components/parity/ParityTable"') &&
    !src.includes("from '../../../components/parity/ParityTable'")
  ) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on list query failure`);
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
  if (!src.includes("storageKey={`dispatch-catalog-${catalogKey}`}")) {
    errors.push("${PAGE}: must set storageKey={`dispatch-catalog-${catalogKey}`}".replace("${PAGE}", PAGE));
  }
  if (!src.includes('tableTestId="dispatch-catalog-list-table"')) {
    errors.push(`${PAGE}: must set tableTestId="dispatch-catalog-list-table"`);
  }
  if (!src.includes("Couldn't load catalog entries")) {
    errors.push(`${PAGE}: must keep ListErrorState title for list outage`);
  }
  if (!src.includes("No entries match these filters")) {
    errors.push(`${PAGE}: must keep emptyText for zero-row filters`);
  }
  if (!src.includes("statusPill")) {
    errors.push(`${PAGE}: must keep the Active/Inactive status pill`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
    function statusPill(isActive) { return ""; }
    const COLUMNS = [
      { key: "code", label: "Code" },
      { key: "display_name", label: "Display Name" },
      { key: "description", label: "Desc" },
      { key: "sort_order", label: "Order" },
      { key: "is_active", label: "Status" },
    ];
    <ListErrorState title="Couldn't load catalog entries" status={0} onRetry={() => {}} />
    <ParityTable
      storageKey={\`dispatch-catalog-\${catalogKey}\`}
      tableTestId="dispatch-catalog-list-table"
      emptyText="No entries match these filters"
    />
  `;
  const bad = `
    export function DispatchCatalogListPage() {
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable + ListErrorState; columns preserved.`);
}

main();
