#!/usr/bin/env node
/**
 * verify-maintenance-services-catalog-uses-paritytable — qbo-parity-a1
 *
 * The Maintenance Services Catalog list (/lists/maintenance/services-catalog) must use
 * shared ParityTable grammar (sort/resize/gear), not a hand-rolled <table>. Query
 * failures must surface ListErrorState + Retry (never a silent empty table). Columns
 * Code / Service / Category / Applies To / Interval / Typical Cost / Safety preserved;
 * centsToDisplay cost formatting, Critical/Routine badge, and empty copy preserved.
 * Display-only migration: no posting/mutation logic on this surface.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-maintenance-services-catalog-uses-paritytable";
const PAGE = "apps/frontend/src/pages/lists/MaintenanceServicesCatalog.tsx";

const REQUIRED_LABELS = ["Code", "Service", "Category", "Applies To", "Interval", "Typical Cost", "Safety"];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../../components/parity/ParityTable"') &&
    !src.includes("from '../../components/parity/ParityTable'")
  ) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on services-catalog query failure`);
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
  if (!src.includes('storageKey="maintenance-services-catalog"')) {
    errors.push(`${PAGE}: must set storageKey="maintenance-services-catalog"`);
  }
  if (!src.includes('tableTestId="maintenance-services-catalog-table"')) {
    errors.push(`${PAGE}: must set tableTestId="maintenance-services-catalog-table"`);
  }
  if (!src.includes("Couldn't load services")) {
    errors.push(`${PAGE}: must keep ListErrorState title for services-catalog outage`);
  }
  if (!src.includes("No services found.")) {
    errors.push(`${PAGE}: must keep emptyText for empty services catalog`);
  }
  if (!src.includes("centsToDisplay")) {
    errors.push(`${PAGE}: must keep centsToDisplay typical-cost formatting (display 1:1)`);
  }
  if (!src.includes("Critical") || !src.includes("Routine")) {
    errors.push(`${PAGE}: must keep the Critical/Routine safety badge`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    function centsToDisplay(n) { return n > 0 ? "$" + (n / 100).toFixed(0) : "—"; }
    const COLUMNS = [
      { key: "service_code", label: "Code" },
      { key: "service_name", label: "Service" },
      { key: "service_category", label: "Category" },
      { key: "applies_to_type", label: "Applies To" },
      { key: "interval_miles", label: "Interval" },
      { key: "typical_cost_cents", label: "Typical Cost", render: (svc) => centsToDisplay(svc.typical_cost_cents) },
      { key: "is_safety_critical", label: "Safety", render: (svc) => (svc.is_safety_critical ? "Critical" : "Routine") },
    ];
    <ListErrorState title="Couldn't load services" status={0} onRetry={() => {}} />
    <ParityTable
      storageKey="maintenance-services-catalog"
      tableTestId="maintenance-services-catalog-table"
      emptyText="No services found."
    />
  `;
  const bad = `
    export function MaintenanceServicesCatalog() {
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
