#!/usr/bin/env node
/**
 * verify-driver-import-modal-uses-paritytable — qbo-parity-a1 (DriverImportModal surface)
 *
 * Driver Master Contacts CSV preview grid must use shared ParityTable grammar (sort/resize/gear),
 * not a hand-rolled <table>. Preview outages must surface ListErrorState (never toast-only).
 * Columns Name / Hire / Term / Status / Result preserved.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-import-modal-uses-paritytable";
const PAGE = "apps/frontend/src/pages/drivers/DriverImportModal.tsx";

const REQUIRED_LABELS = ["Name", "Hire", "Term", "Status", "Result"];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../../components/parity/ParityTable"') &&
    !src.includes("from '../../components/parity/ParityTable'")
  ) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on preview failure`);
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
  if (!src.includes('storageKey="driver-import-preview"')) {
    errors.push(`${PAGE}: must set storageKey="driver-import-preview"`);
  }
  if (!src.includes('tableTestId="driver-import-preview-sample"')) {
    errors.push(`${PAGE}: must set tableTestId="driver-import-preview-sample"`);
  }
  if (!src.includes("Couldn't preview driver import")) {
    errors.push(`${PAGE}: must keep ListErrorState title for preview outage`);
  }
  if (!src.includes("No preview rows returned for this file.")) {
    errors.push(`${PAGE}: must keep emptyText for empty preview sample`);
  }
  if (!src.includes("Import drivers from Master Contacts List (CSV)")) {
    errors.push(`${PAGE}: must keep import modal heading`);
  }
  if (!src.includes("Will create")) {
    errors.push(`${PAGE}: must keep preview summary cards`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    const columns = [
      { key: "name", label: "Name" },
      { key: "hire_date", label: "Hire" },
      { key: "termination_date", label: "Term" },
      { key: "status", label: "Status" },
      { key: "klass", label: "Result" },
    ];
    export function DriverImportModal() {
      return (
        <div>
          <h2>Import drivers from Master Contacts List (CSV)</h2>
          <div>Will create</div>
          <ListErrorState title="Couldn't preview driver import" status={0} onRetry={() => {}} />
          <ParityTable
            storageKey="driver-import-preview"
            tableTestId="driver-import-preview-sample"
            emptyText="No preview rows returned for this file."
          />
        </div>
      );
    }
  `;
  const bad = `
    export function DriverImportModal() {
      return <table><thead><tr><th>Name</th></tr></thead></table>;
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
