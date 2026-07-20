#!/usr/bin/env node
/**
 * verify-accessorial-editor-uses-paritytable — qbo-parity-a1 (AccessorialEditor)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-accessorial-editor-uses-paritytable";
const PAGE = "apps/frontend/src/components/dispatch/AccessorialEditor.tsx";
const REQUIRED_LABELS = ["Code", "Description", "Amount ($)", "Taxable"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../parity/ParityTable"') && !src.includes("from '../parity/ParityTable'")) {
    errors.push(`${PAGE}: must import ParityTable`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on catalog load failure`);
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
  if (!src.includes('tableTestId="accessorial-editor-table"')) {
    errors.push(`${PAGE}: must set tableTestId="accessorial-editor-table"`);
  }
  if (!src.includes("+ Create charge")) {
    errors.push(`${PAGE}: must keep + Create charge`);
  }
  if (!src.includes("No accessorial charges yet.")) {
    errors.push(`${PAGE}: must keep emptyText`);
  }
  return errors;
}

function selftest() {
  const good = `
import { ListErrorState } from "../ListErrorState";
import { ParityTable } from "../parity/ParityTable";
const cols = [
  { key: "code", label: "Code" },
  { key: "description", label: "Description" },
  { key: "amount_cents", label: "Amount ($)" },
  { key: "taxable", label: "Taxable" },
];
export function AccessorialEditor() {
  return (
    <>
      <button>+ Create charge</button>
      <ListErrorState title="Couldn't load accessorial codes" />
      <ParityTable tableTestId="accessorial-editor-table" emptyText="No accessorial charges yet." />
    </>
  );
}
`;
  const bad = `<table><thead></thead></table>`;
  const g = assertMigrated(good);
  const b = assertMigrated(bad);
  if (g.length) {
    console.error(`${LABEL} --selftest FAIL good:`, g);
    process.exit(1);
  }
  if (!b.length) {
    console.error(`${LABEL} --selftest FAIL expected bad to fail`);
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
    console.error(`${LABEL} FAIL:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}

main();
