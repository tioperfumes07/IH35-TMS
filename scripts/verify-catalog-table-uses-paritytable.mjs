#!/usr/bin/env node
/**
 * verify-catalog-table-uses-paritytable — qbo-parity-a1 (CatalogTable surface)
 *
 * Lists/catalogs CatalogTable must use shared ParityTable grammar (sort/resize/gear/
 * selectable batch actions), not a hand-rolled <table>.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-catalog-table-uses-paritytable";
const PAGE = "apps/frontend/src/components/catalogs/CatalogTable.tsx";

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../parity/ParityTable"') && !src.includes("from '../parity/ParityTable'")) {
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
  if (!src.includes("selectable={!readOnly}") && !src.includes("selectable={!readOnly}")) {
    errors.push(`${PAGE}: must enable selectable when not readOnly`);
  }
  if (!src.includes("maxSelectable={SELECTION_CAP}") && !src.includes("maxSelectable={200}")) {
    errors.push(`${PAGE}: must keep selection cap (200)`);
  }
  if (!src.includes("Archive selected")) {
    errors.push(`${PAGE}: must keep Archive selected batch action`);
  }
  if (!src.includes('tableTestId="catalog-table"')) {
    errors.push(`${PAGE}: must set tableTestId="catalog-table"`);
  }
  if (!src.includes("No catalog rows found.")) {
    errors.push(`${PAGE}: must keep emptyText for empty catalog`);
  }
  if (!src.includes("filterBar=")) {
    errors.push(`${PAGE}: must keep search + status filterBar`);
  }
  if (src.includes("BulkActionBar") || src.includes("TableSelection")) {
    errors.push(`${PAGE}: must not wrap with BulkActionBar/TableSelection (ParityTable owns selection)`);
  }
  return errors;
}

function selftest() {
  const good = `
import { ParityTable, type ParityColumn } from "../parity/ParityTable";
export function CatalogTable() {
  return (
    <ParityTable
      tableTestId="catalog-table"
      selectable={!readOnly}
      maxSelectable={SELECTION_CAP}
      filterBar={<div />}
      batchActions={() => <button>Archive selected</button>}
      emptyText="No catalog rows found."
    />
  );
}
`;
  const bad = `
export function CatalogTable() {
  return (
    <table><thead><tr><th>x</th></tr></thead></table>
  );
}
`;
  const g = assertMigrated(good);
  const b = assertMigrated(bad);
  if (g.length) {
    console.error(`${LABEL} --selftest FAIL good:`, g);
    process.exit(1);
  }
  if (!b.length) {
    console.error(`${LABEL} --selftest FAIL expected bad to fail`);
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
  console.log(`${LABEL} PASS`);
}

main();
