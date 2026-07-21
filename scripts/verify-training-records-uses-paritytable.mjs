#!/usr/bin/env node
/**
 * verify-training-records-uses-paritytable — qbo-parity-a1 (TrainingRecordsSection)
 *
 * Driver-profile Training records grid was on the legacy `DataTable` (itself a hand-rolled
 * `<table>`). Migrated to shared ParityTable. `records` is a derived prop from the already-loaded
 * driver-profile aggregate (no independent query in this component) — no ListErrorState is
 * applicable here, matching the CreateWOSectionReconcile precedent.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-training-records-uses-paritytable";
const FILE = "apps/frontend/src/components/driver-profile/TrainingRecordsSection.tsx";
const REQUIRED_LABELS = ["Type", "Completed", "Expiration", "Certificate"];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../parity/ParityTable"') &&
    !src.includes("from '../parity/ParityTable'")
  ) {
    errors.push(`${FILE}: must import ParityTable from components/parity/ParityTable`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length !== 1) {
    errors.push(`${FILE}: expected exactly one <ParityTable>`);
  }
  for (const tag of ["table", "thead", "tbody", "tr", "th", "td"]) {
    if (new RegExp(`<${tag}[\\s>]`).test(src)) {
      errors.push(`${FILE}: must not contain hand-rolled <${tag}> markup`);
    }
  }
  if (src.includes('from "../DataTable"') || src.includes("from '../DataTable'")) {
    errors.push(`${FILE}: must no longer import the legacy DataTable`);
  }
  for (const label of REQUIRED_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${FILE}: missing preserved column label "${label}"`);
    }
  }
  if (!src.includes('data-testid="dp-add-training"')) {
    errors.push(`${FILE}: must preserve the "+ Add training" testid`);
  }
  if (!src.includes("No training records.")) {
    errors.push(`${FILE}: must preserve the empty-state copy`);
  }
  if (!src.includes('storageKey="dp-training-records"')) {
    errors.push(`${FILE}: must set a stable ParityTable storageKey`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../parity/ParityTable";
    const columns = [
      { key: "type", label: "Type" },
      { key: "completion_date", label: "Completed" },
      { key: "expiration_date", label: "Expiration" },
      { key: "certificate_url", label: "Certificate" },
    ];
    <button data-testid="dp-add-training">+ Add training</button>
    <ParityTable storageKey="dp-training-records" emptyText="No training records." />
  `;
  const bad = `
    import { DataTable } from "../DataTable";
    export function TrainingRecordsSection() {
      return <table><thead><tr><th>Type</th></tr></thead></table>;
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
  const src = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  const errors = assertMigrated(src);
  if (errors.length) {
    console.error(`FAIL ${LABEL}:`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(`OK ${LABEL}: ${FILE} uses ParityTable; columns + testids preserved.`);
}

main();
