#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-settlements-section-uses-paritytable";
const PAGE = "apps/frontend/src/components/driver-profile/SettlementsSection.tsx";
const REQUIRED = ["Week ending", "Gross", "Net"];

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
  // BANK-F91297 leftover refuse — SettlementsSection.tsx page-scoped text token ratchet
  if (src.includes("text-[11px]")) errors.push(`${PAGE}: leftover text-[11px]`);
  if (src.includes("#8A92AB") || src.includes("#334155")) errors.push(`${PAGE}: leftover off-scale muted`);
  return errors;
}

function selftest() {
  const good = `
import { ParityTable } from "../parity/ParityTable";
const c = [{ key: "week_ending", label: "Week ending" }, { key: "gross", label: "Gross" }, { key: "net", label: "Net" }];
export function SettlementsSection() {
  return <ParityTable tableTestId="driver-settlements-weeks" emptyText="No recent settlements." />;
}
`;
  const bad = `<table><thead></thead></table>`;
  if (assertMigrated(good).length) { console.error(LABEL, "good fail", assertMigrated(good)); process.exit(1); }
  if (!assertMigrated(bad).length) { console.error(LABEL, "bad should fail"); process.exit(1); }
  // BANK-F91297 leftover plant — SettlementsSection page-scoped text token ratchet
  const leftoverPlant = '<div className="text-[11px] text-[#8A92AB]">plant</div>';
  const leftoverHits = assertMigrated(leftoverPlant);
  if (!leftoverHits.some((e) => e.includes("leftover text-[11px]")) || !leftoverHits.some((e) => e.includes("leftover off-scale muted"))) {
    console.error(LABEL, "leftover plant escaped", leftoverHits);
    process.exit(1);
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
