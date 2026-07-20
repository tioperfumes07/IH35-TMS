#!/usr/bin/env node
/**
 * verify-qbo-vendor-linkage-uses-paritytable — qbo-parity-a1 (QboVendorLinkagePage surface)
 *
 * Admin QBO vendor/class linkage page must use shared ParityTable grammar (sort/resize/gear),
 * not hand-rolled <table>. Outages must surface ListErrorState (never false-empty on failure).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-qbo-vendor-linkage-uses-paritytable";
const PAGE = "apps/frontend/src/pages/admin/QboVendorLinkagePage.tsx";

const DRIVER_LABELS = ["Driver", "Current Vendor", "Status", "Actions"];
const ASSET_LABELS = ["Unit", "QBO Class", "Actions"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../../components/parity/ParityTable"')) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on load failure`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length < 2) {
    errors.push(`${PAGE}: expected ≥2 <ParityTable> (drivers + assets tabs)`);
  }
  if (/<table[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <table>`);
  }
  if (/<thead[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <thead>`);
  }
  for (const label of DRIVER_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing driver column label: "${label}"`);
    }
  }
  for (const label of ASSET_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing asset column label: "${label}"`);
    }
  }
  if (!src.includes('storageKey="qbo-vendor-linkage-drivers"')) {
    errors.push(`${PAGE}: must set storageKey="qbo-vendor-linkage-drivers"`);
  }
  if (!src.includes('storageKey="qbo-vendor-linkage-assets"')) {
    errors.push(`${PAGE}: must set storageKey="qbo-vendor-linkage-assets"`);
  }
  if (!src.includes("No drivers match this filter.")) {
    errors.push(`${PAGE}: must keep emptyText for filtered-empty drivers`);
  }
  if (!src.includes("No units found.")) {
    errors.push(`${PAGE}: must keep emptyText for empty units register`);
  }
  if (!src.includes("Couldn't load driver vendor linkage")) {
    errors.push(`${PAGE}: must keep ListErrorState title for driver outage`);
  }
  if (!src.includes("Couldn't load unit class linkage")) {
    errors.push(`${PAGE}: must keep ListErrorState title for units outage`);
  }
  if (!src.includes('tableTestId="qbo-vendor-linkage-drivers-table"')) {
    errors.push(`${PAGE}: must preserve tableTestId for drivers grid`);
  }
  if (!src.includes('tableTestId="qbo-vendor-linkage-assets-table"')) {
    errors.push(`${PAGE}: must preserve tableTestId for assets grid`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    const driverColumns = [
      { key: "driver", label: "Driver" },
      { key: "qbo_vendor_id", label: "Current Vendor" },
      { key: "linked", label: "Status" },
      { key: "actions", label: "Actions" },
    ];
    const unitColumns = [
      { key: "unit_number", label: "Unit" },
      { key: "qbo_class_id", label: "QBO Class" },
      { key: "actions", label: "Actions" },
    ];
    <ListErrorState title="Couldn't load driver vendor linkage" status={0} onRetry={() => {}} />
    <ListErrorState title="Couldn't load unit class linkage" status={0} onRetry={() => {}} />
    <ParityTable storageKey="qbo-vendor-linkage-drivers" emptyText="No drivers match this filter." tableTestId="qbo-vendor-linkage-drivers-table" />
    <ParityTable storageKey="qbo-vendor-linkage-assets" emptyText="No units found." tableTestId="qbo-vendor-linkage-assets-table" />
  `;
  const bad = `
    export function QboVendorLinkagePage() {
      return (
        <div>
          <table><thead><tr><th>Driver</th></tr></thead></table>
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
