#!/usr/bin/env node
/**
 * verify-vehicle-compliance-uses-paritytable — qbo-parity-a1 (vehicle ComplianceSection plates)
 *
 * Vehicle profile Compliance registration-plates list must use shared ParityTable grammar
 * (sort/resize/gear), not a hand-rolled <table>. Columns Country / Jurisdiction / Expiration
 * preserved; insurance/DOT/SCT/PITA/IFTA summary chrome preserved.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-vehicle-compliance-uses-paritytable";
const PAGE = "apps/frontend/src/components/vehicle-profile/ComplianceSection.tsx";

const REQUIRED_LABELS = ["Country", "Jurisdiction", "Expiration"];
const REGULATORY_REQUIREMENTS = [
  "Annual DOT inspection",
  "Registration / IRP",
  "IFTA license / decal",
  "Form 2290 HVUT",
  "Insurance",
];

function assertMigrated(src) {
  const errors = [];
  if (
    !src.includes('from "../parity/ParityTable"') &&
    !src.includes("from '../parity/ParityTable'")
  ) {
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
  for (const label of REQUIRED_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing column label: "${label}"`);
    }
  }
  if (!src.includes('storageKey="vehicle-compliance-plates"')) {
    errors.push(`${PAGE}: must set storageKey="vehicle-compliance-plates"`);
  }
  if (!src.includes("US insurance")) {
    errors.push(`${PAGE}: must keep US insurance summary row`);
  }
  if (!src.includes("MX insurance")) {
    errors.push(`${PAGE}: must keep MX insurance summary row`);
  }
  if (!src.includes("DOT inspection")) {
    errors.push(`${PAGE}: must keep DOT inspection summary`);
  }
  if (!src.includes("registration_plates")) {
    errors.push(`${PAGE}: must keep registration_plates source`);
  }
  if (!src.includes('tableTestId="vp-compliance-plates-table"')) {
    errors.push(`${PAGE}: must set tableTestId="vp-compliance-plates-table"`);
  }
  if (!src.includes('tableTestId="vp-regulatory-compliance-table"')) {
    errors.push(`${PAGE}: must expose the five-row regulatory compliance table`);
  }
  if (!src.includes("regulatory_requirements")) {
    errors.push(`${PAGE}: must read canonical regulatory_requirements from the unit aggregate`);
  }
  for (const requirement of REGULATORY_REQUIREMENTS) {
    if (!src.includes(requirement)) {
      errors.push(`${PAGE}: missing regulatory requirement ${requirement}`);
    }
  }
  for (const label of ["Requirement", "Status", "Due date", "Cadence", "Authority"]) {
    if (!src.includes(`label: "${label}"`)) errors.push(`${PAGE}: missing regulatory column ${label}`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../parity/ParityTable";
    const columns = [
      { key: "country", label: "Country" },
      { key: "jurisdiction", label: "Jurisdiction" },
      { key: "expiration", label: "Expiration" },
    ];
    function ComplianceSection({ compliance }) {
      const plates = compliance.registration_plates ?? [];
      return (
        <section>
          <div>US insurance</div>
          <div>MX insurance</div>
          <div>DOT inspection</div>
          <div>Annual DOT inspection Registration / IRP IFTA license / decal Form 2290 HVUT Insurance</div>
          <ParityTable tableTestId="vp-regulatory-compliance-table" rows={compliance.regulatory_requirements} columns={[
            { label: "Requirement" }, { label: "Status" }, { label: "Due date" },
            { label: "Cadence" }, { label: "Authority" },
          ]} />
          <ParityTable
            storageKey="vehicle-compliance-plates"
            tableTestId="vp-compliance-plates-table"
            columns={columns}
            rows={plates}
          />
        </section>
      );
    }
  `;
  const bad = `
    export function ComplianceSection() {
      return (
        <section>
          <table><thead><tr><th>Country</th></tr></thead></table>
        </section>
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
  for (const token of [
    'tableTestId="vp-regulatory-compliance-table"',
    "regulatory_requirements",
    ...REGULATORY_REQUIREMENTS,
    ...["Requirement", "Status", "Due date", "Cadence", "Authority"].map((label) => `label: "${label}"`),
  ]) {
    if (assertMigrated(good.replace(token, "__PLANTED_MUTATION__")).length === 0) {
      console.error(`${LABEL} --selftest FAIL planted mutation survived: ${token}`);
      process.exit(1);
    }
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable; columns Country/Jurisdiction/Expiration preserved.`);
}

main();
