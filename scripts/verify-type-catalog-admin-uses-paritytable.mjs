#!/usr/bin/env node
/**
 * verify-type-catalog-admin-uses-paritytable — qbo-parity-a1 (TypeCatalogAdmin)
 *
 * Insurance type catalog admin grid must use shared ParityTable grammar (sort/resize/gear),
 * not a hand-rolled <table>. Catalog query outages must surface ListErrorState (never false-empty).
 * Columns Code/Name/Description/Sort/Status/Actions + + Create type preserved 1:1.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-type-catalog-admin-uses-paritytable";
const PAGE = "apps/frontend/src/pages/insurance/TypeCatalogAdmin.tsx";

const REQUIRED_LABELS = ["Code", "Name", "Description", "Sort", "Status", "Actions"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../../components/parity/ParityTable"')) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on type catalog query failure`);
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
  if (!src.includes('storageKey="insurance-type-catalog-admin"')) {
    errors.push(`${PAGE}: must set storageKey="insurance-type-catalog-admin"`);
  }
  if (!src.includes('tableTestId="insurance-type-catalog-admin-table"')) {
    errors.push(`${PAGE}: must set tableTestId="insurance-type-catalog-admin-table"`);
  }
  if (!src.includes("No type catalog entries.")) {
    errors.push(`${PAGE}: must keep emptyText for empty catalog`);
  }
  if (!src.includes("Couldn't load type catalog")) {
    errors.push(`${PAGE}: must keep ListErrorState title for catalog outage`);
  }
  if (!src.includes("+ Create type")) {
    errors.push(`${PAGE}: must preserve + Create type vocabulary (§7)`);
  }
  if (!src.includes("Deactivate")) {
    errors.push(`${PAGE}: must preserve Deactivate action`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    const columns = [
      { key: "code", label: "Code" },
      { key: "name", label: "Name" },
      { key: "description", label: "Description" },
      { key: "sort_order", label: "Sort" },
      { key: "active", label: "Status" },
      { key: "actions", label: "Actions" },
    ];
    export function TypeCatalogAdmin() {
      return (
        <>
          <button>+ Create type</button>
          <ListErrorState title="Couldn't load type catalog" status={0} onRetry={() => {}} />
          <ParityTable
            storageKey="insurance-type-catalog-admin"
            tableTestId="insurance-type-catalog-admin-table"
            emptyText="No type catalog entries."
          />
          <button>Deactivate</button>
        </>
      );
    }
  `;
  const bad = `
    export function TypeCatalogAdmin() {
      return (
        <table><thead><tr><th>Code</th></tr></thead></table>
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
    console.error(`${LABEL} FAIL:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(
    `${LABEL} PASS — ${PAGE} uses ParityTable + ListErrorState; Code/Name/Description/Sort/Status/Actions preserved.`,
  );
}

main();
