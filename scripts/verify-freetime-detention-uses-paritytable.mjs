#!/usr/bin/env node
/**
 * verify-freetime-detention-uses-paritytable — qbo-parity-a1 (FreeTimeDetentionEditor)
 *
 * Customer free-time/detention terms history must use shared ParityTable grammar,
 * not a hand-rolled <table>. Query failures must surface ListErrorState.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-freetime-detention-uses-paritytable";
const PAGE = "apps/frontend/src/components/customers/FreeTimeDetentionEditor.tsx";

const REQUIRED_LABELS = ["Recorded", "Free Time", "Rate", "Currency", "Approval"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../parity/ParityTable"') && !src.includes("from '../parity/ParityTable'")) {
    errors.push(`${PAGE}: must import ParityTable`);
  }
  if (!src.includes("ListErrorState")) {
    errors.push(`${PAGE}: must render ListErrorState on load failure`);
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
  if (!src.includes('tableTestId="customer-terms-history"')) {
    errors.push(`${PAGE}: must set tableTestId="customer-terms-history"`);
  }
  if (!src.includes("No term changes captured yet.")) {
    errors.push(`${PAGE}: must keep emptyText for empty history`);
  }
  if (!src.includes("Couldn't load terms history")) {
    errors.push(`${PAGE}: must keep ListErrorState title for history outage`);
  }
  return errors;
}

function selftest() {
  const good = `
import { ListErrorState } from "../ListErrorState";
import { ParityTable } from "../parity/ParityTable";
const HISTORY_COLUMNS = [
  { key: "recorded_at", label: "Recorded" },
  { key: "free_time_minutes", label: "Free Time" },
  { key: "detention_rate_per_hour", label: "Rate" },
  { key: "detention_currency", label: "Currency" },
  { key: "detention_requires_approval", label: "Approval" },
];
export function FreeTimeDetentionEditor() {
  return (
    <>
      <ListErrorState title="Couldn't load terms history" />
      <ParityTable tableTestId="customer-terms-history" emptyText="No term changes captured yet." />
    </>
  );
}
`;
  const bad = `<table><thead><tr><th>x</th></tr></thead></table>`;
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
