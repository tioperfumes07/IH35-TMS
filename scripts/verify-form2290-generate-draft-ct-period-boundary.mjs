#!/usr/bin/env node
// FORM2290-GENERATE-DRAFT-UTC-PERIOD-BOUNDARY — guard
//
// Form2290Filings.tsx's "Generate draft" mutation computed the HVUT tax-period boundary (July 1)
// via getUTCFullYear()/getUTCMonth() instead of Central Time (CLAUDE.md §8 "Central Time always").
// A user clicking "Generate draft" in the ~5-6 hour window after 7 PM CT on June 30 (UTC has
// already rolled to July 1, but it is still June 30 in Central Time) got the computed tax period
// bumped a year early. Fixed to anchor on businessDate.ts's companyToday() (America/Chicago).

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const FILE = "apps/frontend/src/pages/compliance/Form2290Filings.tsx";

export function check(text) {
  const failures = [];
  const idx = text.indexOf("mutationFn: () => {");
  const block = idx >= 0 ? text.slice(idx, idx + 700) : "";
  if (!/companyToday\(\)/.test(block)) {
    failures.push(`${FILE} generate-draft mutation no longer anchors the tax period on companyToday()`);
  }
  if (/new Date\(\)\.getUTCFullYear\(\)/.test(block) || /new Date\(\)\.getUTCMonth\(\)/.test(block)) {
    failures.push(`${FILE} generate-draft mutation reverted to UTC-anchored getUTCFullYear/getUTCMonth`);
  }
  return failures;
}

function run() {
  const text = fs.readFileSync(path.join(root, FILE), "utf8");
  const failures = check(text);
  if (failures.length > 0) {
    console.error("FAIL: form2290-generate-draft-ct-period-boundary");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: Form 2290 generate-draft tax-period boundary is anchored on Central Time");
}

function selftest() {
  const text = fs.readFileSync(path.join(root, FILE), "utf8");
  const offender = text.replace(
    'const [ty, tmoStr] = companyToday().split("-");\n      const year = Number(ty);\n      const month = Number(tmoStr) - 1; // 0-indexed to match the original month>=6 comparison',
    "const year = new Date().getUTCFullYear();\n      const month = new Date().getUTCMonth();"
  );
  if (offender === text) {
    console.error("FAIL(selftest): offender mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failures = check(offender);
  if (failures.length === 0) {
    console.error("FAIL(selftest): planted offender (reverted to UTC anchor) was NOT caught");
    process.exit(1);
  }
  console.log("PASS(selftest): 1/1 planted regression correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
