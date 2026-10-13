#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-settlements-section-uses-paritytable";
const PAGE = "apps/frontend/src/components/driver-profile/SettlementsSection.tsx";
// 443.99 (CC-2) — old rule: columns "Week ending", "Gross", "Net".
//   new rule: "Settlement #", "Period Begin", "Period End", "Gross", "Net".
//   why: COL-06 (ACCT-F10360, f3276b46ba) split the lone date column into the settlement's identity + full period
//        (Settlement # link, Period Begin, and Period End — the renamed "Week ending", same value). Stricter, not
//        looser: the old three are still required (Period End carries the week-ending date) plus the two COL-06 added.
const REQUIRED = ["Settlement #", "Period Begin", "Period End", "Gross", "Net"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../parity/ParityTable"') && !src.includes("from '../parity/ParityTable'")) {
    errors.push(`${PAGE}: must import ParityTable`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length < 1) errors.push(`${PAGE}: expected ≥1 <ParityTable>`);
  if (/<table[\s>]/.test(src)) errors.push(`${PAGE}: must not contain hand-rolled <table>`);
  if (/<thead[\s>]/.test(src)) errors.push(`${PAGE}: must not contain hand-rolled <thead>`);
  for (const label of REQUIRED) {
    if (!src.includes(`label: "${label}"`)) errors.push(`${PAGE}: missing column label: "${label}"`);
  }
  if (!src.includes('tableTestId="driver-settlements-weeks"')) {
    errors.push(`${PAGE}: must set tableTestId="driver-settlements-weeks"`);
  }
  if (!src.includes("No recent settlements.")) errors.push(`${PAGE}: must keep emptyText`);
  return errors;
}

function selftest() {
  const good = `
import { ParityTable } from "../parity/ParityTable";
const c = [{ key: "settlement_display_id", label: "Settlement #" }, { key: "period_start", label: "Period Begin" }, { key: "week_ending", label: "Period End" }, { key: "gross", label: "Gross" }, { key: "net", label: "Net" }];
export function SettlementsSection() {
  return <ParityTable tableTestId="driver-settlements-weeks" emptyText="No recent settlements." />;
}
`;
  const bad = `<table><thead></thead></table>`;
  if (assertMigrated(good).length) { console.error(LABEL, "good fail", assertMigrated(good)); process.exit(1); }
  if (!assertMigrated(bad).length) { console.error(LABEL, "bad should fail"); process.exit(1); }
  if (!assertMigrated(good.replace('label: "Settlement #"', 'label: "Week"')).some((e) => e.includes("Settlement #"))) {
    console.error(LABEL, "dropped Settlement # column should fail"); process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const errors = assertMigrated(fs.readFileSync(path.join(ROOT, PAGE), "utf8"));
  if (errors.length) { console.error(`${LABEL} FAIL:`); for (const e of errors) console.error(`  - ${e}`); process.exit(1); }
  console.log(`${LABEL} PASS`);
}
main();
