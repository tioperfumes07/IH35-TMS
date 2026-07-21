#!/usr/bin/env node
/**
 * verify-maintenance-parts-catalog-uses-paritytable — qbo-parity-a1 (lists surface)
 *
 * The Maintenance Parts Catalog list must use shared ParityTable grammar
 * (sort/resize/gear), not a hand-rolled <table>. Query failures must surface
 * ListErrorState + Retry (never a silent empty table). Columns SKU / Part Name /
 * Manufacturer / Category / Compatible Models / Typical Cost preserved in order;
 * cents display formatting and empty copy preserved. Display-only migration —
 * no posting/mutation logic on this surface.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-maintenance-parts-catalog-uses-paritytable";
const PAGE = "apps/frontend/src/pages/lists/MaintenancePartsCatalog.tsx";

const REQUIRED_LABELS = ["SKU", "Part Name", "Manufacturer", "Category", "Compatible Models", "Typical Cost"];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../../components/parity/ParityTable"') &&
    !src.includes("from '../../components/parity/ParityTable'")
  ) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on parts-catalog query failure`);
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
  if (!src.includes('storageKey="maintenance-parts-catalog"')) {
    errors.push(`${PAGE}: must set storageKey="maintenance-parts-catalog"`);
  }
  if (!src.includes('tableTestId="maintenance-parts-catalog-table"')) {
    errors.push(`${PAGE}: must set tableTestId="maintenance-parts-catalog-table"`);
  }
  if (!src.includes("Couldn't load parts catalog")) {
    errors.push(`${PAGE}: must keep ListErrorState title for parts-catalog outage`);
  }
  if (!src.includes("No parts found.")) {
    errors.push(`${PAGE}: must keep emptyText for empty parts catalog`);
  }
  if (!src.includes("(n / 100).toFixed(2)")) {
    errors.push(`${PAGE}: must keep the cents display formatter (typical cost 1:1)`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    function cents(n) { return n > 0 ? \`$\${(n / 100).toFixed(2)}\` : "—"; }
    const COLUMNS = [
      { key: "sku", label: "SKU" },
      { key: "part_name", label: "Part Name" },
      { key: "manufacturer", label: "Manufacturer" },
      { key: "category", label: "Category" },
      { key: "model_compatibility", label: "Compatible Models" },
      { key: "typical_unit_cost_cents", label: "Typical Cost" },
    ];
    <ListErrorState title="Couldn't load parts catalog" status={0} onRetry={() => {}} />
    <ParityTable
      storageKey="maintenance-parts-catalog"
      tableTestId="maintenance-parts-catalog-table"
      emptyText="No parts found."
    />
  `;
  const bad = `
    export function MaintenancePartsCatalog() {
      return (
        <div>
          <table><thead><tr><th>SKU</th></tr></thead></table>
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
