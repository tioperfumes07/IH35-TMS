#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-labor-tracker-uses-paritytable";
const PAGE = "apps/frontend/src/components/maintenance/LaborTracker.tsx";
const REQUIRED = ["ID", "Actor", "Start", "End", "Min", "Cost ¢"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../parity/ParityTable"') && !src.includes("from '../parity/ParityTable'")) {
    errors.push(`${PAGE}: must import ParityTable`);
  }
  if (!src.includes("ListErrorState")) errors.push(`${PAGE}: must use ListErrorState on entries failure`);
  if ((src.match(/<ParityTable\b/g) ?? []).length < 1) errors.push(`${PAGE}: expected ≥1 <ParityTable>`);
  if (/<table[\s>]/.test(src)) errors.push(`${PAGE}: must not contain hand-rolled <table>`);
  if (/<thead[\s>]/.test(src)) errors.push(`${PAGE}: must not contain hand-rolled <thead>`);
  for (const label of REQUIRED) {
    if (!src.includes(`label: "${label}"`)) errors.push(`${PAGE}: missing column label: "${label}"`);
  }
  if (!src.includes('data-testid="maint-labor-entries-table"')) {
    errors.push(`${PAGE}: must keep maint-labor-entries-table wrapper`);
  }
  if (!src.includes("No time entries yet.")) errors.push(`${PAGE}: must keep emptyText`);
  if (!src.includes("Clock in")) errors.push(`${PAGE}: must keep Clock in`);
  return errors;
}

function selftest() {
  const good = `
import { ListErrorState } from "../ListErrorState";
import { ParityTable } from "../parity/ParityTable";
const c = [${REQUIRED.map((l) => `{ label: "${l}" }`).join(", ")}];
export function LaborTracker() {
  return (
    <div data-testid="maint-labor-entries-table">
      <button>Clock in</button>
      <ListErrorState />
      <ParityTable emptyText="No time entries yet." />
    </div>
  );
}
`;
  const bad = `<table><thead></thead></table>`;
  if (assertMigrated(good).length) { console.error(LABEL, assertMigrated(good)); process.exit(1); }
  if (!assertMigrated(bad).length) { console.error(LABEL, "bad should fail"); process.exit(1); }
  console.log(`${LABEL} --selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const errors = assertMigrated(fs.readFileSync(path.join(ROOT, PAGE), "utf8"));
  if (errors.length) { console.error(`${LABEL} FAIL`); for (const e of errors) console.error(`  - ${e}`); process.exit(1); }
  console.log(`${LABEL} PASS`);
}
main();
