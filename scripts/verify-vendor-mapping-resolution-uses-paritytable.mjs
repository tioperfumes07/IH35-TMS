#!/usr/bin/env node
/**
 * verify-vendor-mapping-resolution-uses-paritytable — qbo-parity-a1 (VendorMappingResolutionPage)
 *
 * Samsara vendor mapping resolution page must use shared ParityTable grammar (sort/resize/gear),
 * not hand-rolled <table>. Integrity outages must surface ListErrorState (never false-empty on failure).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-vendor-mapping-resolution-uses-paritytable";
const PAGE = "apps/frontend/src/pages/samsara-vendor-mapping/VendorMappingResolutionPage.tsx";

const UNMAPPED_LABELS = ["Samsara driver", "Name", "Reason", "Action"];
const DUPLICATE_LABELS = ["Samsara driver", "Vendor count", "Vendor ids", "Action"];
const MISMATCH_LABELS = ["Samsara driver", "Samsara name", "QBO vendor name", "Score", "Action"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../../components/parity/ParityTable"')) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on load failure`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length < 3) {
    errors.push(`${PAGE}: expected ≥3 <ParityTable> (unmapped + duplicate + name mismatch)`);
  }
  if (/<table[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <table>`);
  }
  if (/<thead[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <thead>`);
  }
  for (const label of UNMAPPED_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing unmapped column label: "${label}"`);
    }
  }
  for (const label of DUPLICATE_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing duplicate column label: "${label}"`);
    }
  }
  for (const label of MISMATCH_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing name-mismatch column label: "${label}"`);
    }
  }
  if (!src.includes('storageKey="vendor-mapping-resolution-unmapped"')) {
    errors.push(`${PAGE}: must set storageKey="vendor-mapping-resolution-unmapped"`);
  }
  if (!src.includes('storageKey="vendor-mapping-resolution-duplicate"')) {
    errors.push(`${PAGE}: must set storageKey="vendor-mapping-resolution-duplicate"`);
  }
  if (!src.includes('storageKey="vendor-mapping-resolution-name-mismatch"')) {
    errors.push(`${PAGE}: must set storageKey="vendor-mapping-resolution-name-mismatch"`);
  }
  if (!src.includes("No unmapped drivers.")) {
    errors.push(`${PAGE}: must keep emptyText for unmapped drivers`);
  }
  if (!src.includes("No duplicate mappings.")) {
    errors.push(`${PAGE}: must keep emptyText for duplicate mappings`);
  }
  if (!src.includes("No name mismatches.")) {
    errors.push(`${PAGE}: must keep emptyText for name mismatches`);
  }
  if (!src.includes("Couldn't load vendor mapping integrity")) {
    errors.push(`${PAGE}: must keep ListErrorState title for integrity outage`);
  }
  if (!src.includes('tableTestId="vendor-mapping-unmapped-table"')) {
    errors.push(`${PAGE}: must preserve tableTestId for unmapped grid`);
  }
  if (!src.includes('tableTestId="vendor-mapping-duplicate-table"')) {
    errors.push(`${PAGE}: must preserve tableTestId for duplicate grid`);
  }
  if (!src.includes('tableTestId="vendor-mapping-name-mismatch-table"')) {
    errors.push(`${PAGE}: must preserve tableTestId for name-mismatch grid`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    const unmappedColumns = [
      { key: "samsara_driver_id", label: "Samsara driver" },
      { key: "driver_name", label: "Name" },
      { key: "reason", label: "Reason" },
      { key: "action", label: "Action" },
    ];
    const duplicateColumns = [
      { key: "samsara_driver_id", label: "Samsara driver" },
      { key: "vendor_count", label: "Vendor count" },
      { key: "qbo_vendor_ids", label: "Vendor ids" },
      { key: "action", label: "Action" },
    ];
    const mismatchColumns = [
      { key: "samsara_driver_id", label: "Samsara driver" },
      { key: "samsara_name", label: "Samsara name" },
      { key: "qbo_vendor_name", label: "QBO vendor name" },
      { key: "similarity_score", label: "Score" },
      { key: "action", label: "Action" },
    ];
    <ListErrorState title="Couldn't load vendor mapping integrity" status={0} onRetry={() => {}} />
    <ParityTable storageKey="vendor-mapping-resolution-unmapped" emptyText="No unmapped drivers." tableTestId="vendor-mapping-unmapped-table" />
    <ParityTable storageKey="vendor-mapping-resolution-duplicate" emptyText="No duplicate mappings." tableTestId="vendor-mapping-duplicate-table" />
    <ParityTable storageKey="vendor-mapping-resolution-name-mismatch" emptyText="No name mismatches." tableTestId="vendor-mapping-name-mismatch-table" />
  `;
  const bad = `
    export function VendorMappingResolutionPage() {
      return (
        <div>
          <table><thead><tr><th>Samsara driver</th></tr></thead></table>
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
