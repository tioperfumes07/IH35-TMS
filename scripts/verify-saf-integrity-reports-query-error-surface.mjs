#!/usr/bin/env node
/**
 * verify-saf-integrity-reports-query-error-surface
 * SAF-INTEGRITY-REPORTS-QUERY-ERROR — active sub-tab list query + observationsQuery must surface errors.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-saf-integrity-reports-query-error-surface";
const FILE = "apps/frontend/src/pages/safety/tabs/IntegrityReportsTab.tsx";
const NEEDLES = [
  "activeListQuery",
  "activeListQuery.isError",
  "observationsQuery.isError",
  "integrity-reports-query-error",
  "integrity-observations-query-error",
  "fuelQuery",
  "dwellQuery",
  "hosQuery",
];

function assertFile(rel, needles) {
  const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  return needles.filter((n) => !src.includes(n)).map((n) => `${rel}: missing ${n}`);
}

function selftest() {
  const bad = `{woQuery.isError ? (`;
  const good = NEEDLES.join("\n");
  const tmp = path.join(process.cwd(), ".tmp-integrity-query-selftest.tsx");
  fs.writeFileSync(tmp, bad);
  try {
    if (assertFile(".tmp-integrity-query-selftest.tsx", ["activeListQuery.isError"]).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL bad`);
      process.exit(1);
    }
  } finally {
    fs.unlinkSync(tmp);
  }
  fs.writeFileSync(tmp, good);
  try {
    if (assertFile(".tmp-integrity-query-selftest.tsx", NEEDLES).length > 0) {
      console.error(`${LABEL} SELFTEST FAIL good`);
      process.exit(1);
    }
  } finally {
    fs.unlinkSync(tmp);
  }
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

if (!fs.existsSync(path.join(process.cwd(), FILE))) {
  console.error(`${LABEL} FAIL: missing ${FILE}`);
  process.exit(1);
}
const errors = assertFile(FILE, NEEDLES);
if (errors.length) {
  console.error(`${LABEL} FAIL:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
// Must not gate only on woQuery for the ParityTable error branch.
const src = fs.readFileSync(path.join(process.cwd(), FILE), "utf8");
if (/\{woQuery\.isError \? \(/.test(src) && !src.includes("activeListQuery.isError")) {
  console.error(`${LABEL} FAIL: still gates list error only on woQuery.isError`);
  process.exit(1);
}
console.log(`${LABEL} PASS — IntegrityReportsTab surfaces active sub-tab + observations query errors`);
