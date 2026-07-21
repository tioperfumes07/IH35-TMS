#!/usr/bin/env node
/**
 * verify-accounting-catalog-list-uses-paritytable — qbo-parity-a1 (shared accounting catalog list surface)
 *
 * The shared AccountingCatalogListPage (Classes / Terms / Payment Methods / etc.) must use the
 * shared ParityTable grammar (sort/resize/gear/pager), not a hand-rolled <table>. Query failures
 * must surface ListErrorState + Retry (never a silent empty table). Columns {codeLabel} /
 * Display Name / Details / Status preserved; status pill, bulk-select batch bar (Block 7),
 * row-click profile drawer, and empty copy preserved. DISPLAY-ONLY: no posting/mutation logic
 * lives on this surface — catalog bulk CRUD stays wired through batchActions.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-accounting-catalog-list-uses-paritytable";
const PAGE = "apps/frontend/src/pages/lists/accounting/AccountingCatalogListPage.tsx";

const REQUIRED_LABELS = ["Display Name", "Details", "Status"];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../../../components/parity/ParityTable"') &&
    !src.includes("from '../../../components/parity/ParityTable'")
  ) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on catalog list query failure`);
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
  if (!src.includes("label: codeLabel")) {
    errors.push(`${PAGE}: must keep the dynamic codeLabel column`);
  }
  if (!src.includes("storageKey={`accounting-catalog-")) {
    errors.push(`${PAGE}: must set a per-catalog storageKey prefixed accounting-catalog-`);
  }
  if (!src.includes('tableTestId="accounting-catalog-list-table"')) {
    errors.push(`${PAGE}: must set tableTestId="accounting-catalog-list-table"`);
  }
  if (!src.includes("Couldn't load ${displayName")) {
    errors.push(`${PAGE}: must keep ListErrorState title for catalog list outage`);
  }
  if (!src.includes("emptyText={`No ${displayName.toLowerCase()} found.`}")) {
    errors.push(`${PAGE}: must keep emptyText for an empty catalog`);
  }
  if (!src.includes("statusPillClass")) {
    errors.push(`${PAGE}: must keep the Active/Inactive status pill`);
  }
  if (!src.includes("selectable={bulkEnabled}") || !src.includes("batchActions=")) {
    errors.push(`${PAGE}: must keep Block 7 bulk-select wired via selectable/batchActions`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
    function statusPillClass(a) { return ""; }
    const columns = [
      { key: "code", label: codeLabel },
      { key: "display_name", label: "Display Name" },
      { key: "details", label: "Details" },
      { key: "is_active", label: "Status" },
    ];
    <ListErrorState title={\`Couldn't load \${displayName.toLowerCase()}\`} status={0} onRetry={() => {}} />
    <ParityTable
      storageKey={\`accounting-catalog-\${displayName}\`}
      tableTestId="accounting-catalog-list-table"
      emptyText={\`No \${displayName.toLowerCase()} found.\`}
      selectable={bulkEnabled}
      batchActions={undefined}
    />
  `;
  const bad = `
    export function AccountingCatalogListPage() {
      return (
        <div>
          <table><thead><tr><th>Display Name</th></tr></thead></table>
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
