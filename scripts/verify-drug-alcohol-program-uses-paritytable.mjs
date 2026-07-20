#!/usr/bin/env node
/**
 * verify-drug-alcohol-program-uses-paritytable — qbo-parity-a1 (DrugAlcoholProgramTab surface)
 *
 * Safety Drug & Alcohol Program tab must use shared ParityTable grammar (sort/resize/gear),
 * not hand-rolled <table>. Outages must surface ListErrorState (never false-empty on failure).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-drug-alcohol-program-uses-paritytable";
const PAGE = "apps/frontend/src/pages/safety/drug-alcohol/DrugAlcoholProgramTab.tsx";

const ENROLLMENT_LABELS = ["Driver", "Consortium", "Enrolled"];
const POSITIVE_LABELS = ["Driver", "Type", "Kind", "Result", "Collected"];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../../../components/parity/ParityTable"') &&
    !src.includes("from '../../../components/parity/ParityTable'")
  ) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on load failure`);
  }
  if (!src.includes("EntityLink")) {
    errors.push(`${PAGE}: must use EntityLink for driver drill-through`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length < 2) {
    errors.push(`${PAGE}: expected ≥2 <ParityTable> (enrollments + positives)`);
  }
  if (/<table[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <table>`);
  }
  if (/<thead[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <thead>`);
  }
  for (const label of ENROLLMENT_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing enrollment column label: "${label}"`);
    }
  }
  for (const label of POSITIVE_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing positive column label: "${label}"`);
    }
  }
  if (!src.includes('storageKey="safety-da-program-enrollments"')) {
    errors.push(`${PAGE}: must set storageKey="safety-da-program-enrollments"`);
  }
  if (!src.includes('storageKey="safety-da-program-positives"')) {
    errors.push(`${PAGE}: must set storageKey="safety-da-program-positives"`);
  }
  if (!src.includes("No active consortium enrollments.")) {
    errors.push(`${PAGE}: must keep emptyText for empty enrollments roster`);
  }
  if (!src.includes("No open positive results. All clear.")) {
    errors.push(`${PAGE}: must keep emptyText for empty positive queue`);
  }
  if (!src.includes("Couldn't load consortium enrollments")) {
    errors.push(`${PAGE}: must keep ListErrorState title for enrollments outage`);
  }
  if (!src.includes("Couldn't load positive results")) {
    errors.push(`${PAGE}: must keep ListErrorState title for positives outage`);
  }
  if (!src.includes("Consortium Enrollments")) {
    errors.push(`${PAGE}: must keep Consortium Enrollments section heading`);
  }
  if (!src.includes("Positive Results — SAP Referral Queue")) {
    errors.push(`${PAGE}: must keep Positive Results SAP queue heading`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ListErrorState } from "../../../components/ListErrorState";
    import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
    import { EntityLink } from "../../../components/shared/EntityLink";
    const enrollmentColumns = [
      { key: "driver_uuid", label: "Driver", render: (row) => <EntityLink kind="driver" id={row.driver_uuid} /> },
      { key: "consortium_name", label: "Consortium" },
      { key: "enrolled_at", label: "Enrolled" },
    ];
    const positiveColumns = [
      { key: "driver_uuid", label: "Driver" },
      { key: "test_type", label: "Type" },
      { key: "test_kind", label: "Kind" },
      { key: "result", label: "Result" },
      { key: "collected_at", label: "Collected" },
    ];
    <h2>Consortium Enrollments</h2>
    <ListErrorState title="Couldn't load consortium enrollments" status={0} onRetry={() => {}} />
    <ParityTable storageKey="safety-da-program-enrollments" emptyText="No active consortium enrollments." />
    <h2>Positive Results — SAP Referral Queue</h2>
    <ListErrorState title="Couldn't load positive results" status={0} onRetry={() => {}} />
    <ParityTable storageKey="safety-da-program-positives" emptyText="No open positive results. All clear." />
  `;
  const bad = `
    export function DrugAlcoholProgramTab() {
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
