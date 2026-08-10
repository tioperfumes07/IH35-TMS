#!/usr/bin/env node
/**
 * Locks the lease-to-own creator's fleet picker and per-truck terms grid to
 * the shared ParityTable grammar. Legal contract creation must retain all
 * selection and term-entry fields while receiving table parity controls.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lease-to-own-creator-uses-paritytable";
const PAGE = "apps/frontend/src/pages/legal/contracts/LeaseToOwnCreatorModal.tsx";
const REQUIRED_LABELS = [
  "Select",
  "Unit",
  "VIN",
  "Make/Model/Yr",
  "Owner",
  "Status",
  "Lienholder",
  "Balance owed",
  "Monthly lease",
  "Due date",
];
const REQUIRED_STORAGE_KEYS = [
  'storageKey="legal-lease-to-own-fleet-picker"',
  'storageKey="legal-lease-to-own-per-truck-terms"',
];

function assertMigrated(source) {
  const errors = [];
  if (!source.includes('from "../../../components/parity/ParityTable"')) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (!source.includes('from "../../../components/ListErrorState"')) {
    errors.push(`${PAGE}: must render ListErrorState for fleet-load failures`);
  }
  if ((source.match(/<ParityTable\b/g) ?? []).length < 2) {
    errors.push(`${PAGE}: expected ParityTable for fleet picker and per-truck terms`);
  }
  if (/<table[\s>]/.test(source) || /<thead[\s>]/.test(source) || /<tbody[\s>]/.test(source)) {
    errors.push(`${PAGE}: must not contain a hand-rolled table`);
  }
  for (const label of REQUIRED_LABELS) {
    if (!source.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing preserved column label: ${label}`);
    }
  }
  for (const storageKey of REQUIRED_STORAGE_KEYS) {
    if (!source.includes(storageKey)) errors.push(`${PAGE}: missing ${storageKey}`);
  }
  if (!source.includes('emptyText="No eligible fleet units found for this owner."')) {
    errors.push(`${PAGE}: must retain the settled empty state for eligible fleet units`);
  }
  if (!source.includes('emptyText="Select vehicles in step 2 first."')) {
    errors.push(`${PAGE}: must retain the per-truck terms empty state`);
  }
  if (!/<Combobox[\s\S]*?id="lease-to-own-owner-picker"/.test(source)) {
    errors.push(`${PAGE}: truck owner must use the searchable Combobox`);
  }
  if (/<select[\s\S]*?value=\{ownerCompanyId\}/.test(source)) {
    errors.push(`${PAGE}: truck owner must not regress to a native company-ID select`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable } from "../../../components/parity/ParityTable";
    import { ListErrorState } from "../../../components/ListErrorState";
    const Combobox = () => <input />;
    const columns = [
      { key: "select", label: "Select" }, { key: "unit", label: "Unit" },
      { key: "vin", label: "VIN" }, { key: "model", label: "Make/Model/Yr" },
      { key: "owner", label: "Owner" }, { key: "status", label: "Status" },
      { key: "lienholder", label: "Lienholder" }, { key: "balance", label: "Balance owed" },
      { key: "lease", label: "Monthly lease" }, { key: "due", label: "Due date" },
    ];
    export function LeaseToOwnCreatorModal() {
      return <><Combobox id="lease-to-own-owner-picker" /><ListErrorState /><ParityTable storageKey="legal-lease-to-own-fleet-picker" emptyText="No eligible fleet units found for this owner." /><ParityTable storageKey="legal-lease-to-own-per-truck-terms" emptyText="Select vehicles in step 2 first." /></>;
    }
  `;
  const bad = `
    export function LeaseToOwnCreatorModal() {
      return <table><thead><tr><th>Unit</th></tr></thead><tbody /></table>;
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
  const source = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  const errors = assertMigrated(source);
  if (errors.length) {
    console.error(`FAIL ${LABEL}:`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable for fleet selection and per-truck terms.`);
}

main();
