#!/usr/bin/env node
/**
 * verify-drivers-reference-catalog-uses-paritytable — qbo-parity-a1 (DriversReferenceCatalogPage)
 *
 * The Drivers reference-catalog list page must use shared ParityTable grammar
 * (sort/resize/gear), not a hand-rolled <table>. Query failures must surface
 * ListErrorState + Retry (never a silent empty table). Columns Code / Label /
 * Sort Order / Archived / Actions preserved; the archived pill and the inline
 * Archive/Unarchive action button preserved.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-drivers-reference-catalog-uses-paritytable";
const PAGE = "apps/frontend/src/pages/lists/drivers/DriversReferenceCatalogPage.tsx";

const REQUIRED_LABELS = ["Code", "Label", "Sort Order", "Archived", "Actions"];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../../../components/parity/ParityTable"') &&
    !src.includes("from '../../../components/parity/ParityTable'")
  ) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on catalog query failure`);
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
  if (!src.includes("drivers-ref-catalog-")) {
    errors.push(`${PAGE}: must set a drivers-ref-catalog-* storageKey`);
  }
  if (!src.includes('tableTestId="drivers-reference-catalog-table"')) {
    errors.push(`${PAGE}: must set tableTestId="drivers-reference-catalog-table"`);
  }
  if (!src.includes("archivedPillClass")) {
    errors.push(`${PAGE}: must keep the archived/active pill chrome`);
  }
  if (!src.includes("Unarchive")) {
    errors.push(`${PAGE}: must keep the inline Archive/Unarchive action button`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
    function archivedPillClass(archived) { return ""; }
    const COLUMNS = [
      { key: "code", label: "Code" },
      { key: "label", label: "Label" },
      { key: "sort_order", label: "Sort Order" },
      { key: "archived_at", label: "Archived" },
      { key: "actions", label: "Actions", render: (row) => <Button>{row.archived_at ? "Unarchive" : "Archive"}</Button> },
    ];
    <ListErrorState title="Couldn't load catalog" status={0} onRetry={() => {}} />
    <ParityTable
      storageKey={\`drivers-ref-catalog-\${catalogKey}\`}
      tableTestId="drivers-reference-catalog-table"
    />
  `;
  const bad = `
    export function DriversReferenceCatalogPage() {
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
