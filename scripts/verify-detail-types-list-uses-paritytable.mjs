#!/usr/bin/env node
/**
 * verify-detail-types-list-uses-paritytable — qbo-parity-a1 (Detail Type catalog list surface)
 *
 * The Lists → Accounting → Detail Type catalog grid must use shared ParityTable grammar
 * (sort/resize/gear), not a hand-rolled <table>. Query failures must surface
 * ListErrorState + Retry (never a silent empty table). Columns Account Type / Detail Type /
 * Code / Source / Order / Status preserved; System (locked) vs Custom badge chrome,
 * row-click-to-edit on non-system rows, and the settled empty copy preserved.
 * Display-only migration — no mutation/posting logic may change.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-detail-types-list-uses-paritytable";
const PAGE = "apps/frontend/src/pages/lists/accounting/DetailTypesListPage.tsx";

const REQUIRED_LABELS = ["Account Type", "Detail Type", "Code", "Source", "Order", "Status"];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../../../components/parity/ParityTable"') &&
    !src.includes("from '../../../components/parity/ParityTable'")
  ) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on detail-types query failure`);
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
  if (!src.includes('storageKey="detail-types-list"')) {
    errors.push(`${PAGE}: must set storageKey="detail-types-list"`);
  }
  if (!src.includes('tableTestId="detail-types-table"')) {
    errors.push(`${PAGE}: must set tableTestId="detail-types-table"`);
  }
  if (!src.includes("Couldn't load detail types")) {
    errors.push(`${PAGE}: must keep ListErrorState title for detail-types outage`);
  }
  if (!src.includes("No detail types found.")) {
    errors.push(`${PAGE}: must keep emptyText for empty detail types`);
  }
  if (!src.includes("System (locked)")) {
    errors.push(`${PAGE}: must keep the System (locked) source badge`);
  }
  if (!src.includes("row.is_system")) {
    errors.push(`${PAGE}: must keep the system-row guard on row click-to-edit`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
    const COLUMNS = [
      { key: "account_type_id", label: "Account Type" },
      { key: "name", label: "Detail Type" },
      { key: "code", label: "Code" },
      { key: "is_system", label: "Source" },
      { key: "sort_order", label: "Order" },
      { key: "is_active", label: "Status" },
    ];
    <span>System (locked)</span>
    <ListErrorState title="Couldn't load detail types" status={0} onRetry={() => {}} />
    <ParityTable
      storageKey="detail-types-list"
      tableTestId="detail-types-table"
      emptyText="No detail types found."
      onRowClick={(row) => { if (row.is_system) return; }}
    />
  `;
  const bad = `
    export function DetailTypesListPage() {
      return (
        <div>
          <table><thead><tr><th>Account Type</th></tr></thead></table>
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
