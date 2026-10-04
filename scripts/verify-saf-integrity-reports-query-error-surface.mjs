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

function leftoverErrors(src) {
  const errors = [];
  if (src.includes("text-[11px]")) errors.push("leftover text-[11px]");
  if (src.includes("#8A92AB") || src.includes("#334155")) errors.push("leftover off-scale muted");
  if (src.includes("#cbd5e1") || src.includes("#CBD5E1")) errors.push("leftover #cbd5e1 border");
  if (src.includes("text-slate-") || src.includes("border-slate-") || src.includes("bg-slate-")) {
    errors.push("leftover slate class");
  }
  return errors;
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
  const leftover = leftoverErrors(`${good}\n<div className="text-[11px] text-slate-700 border-slate-300 bg-slate-100" style={{ color: "#334155", borderColor: "#cbd5e1" }}>plant</div>`);
  if (!leftover.includes("leftover text-[11px]") || !leftover.includes("leftover off-scale muted") || !leftover.includes("leftover #cbd5e1 border") || !leftover.includes("leftover slate class")) {
    console.error(`${LABEL} SELFTEST FAIL leftover plant escaped`, leftover);
    process.exit(1);
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
const leftover = leftoverErrors(src);
if (leftover.length) {
  console.error(`${LABEL} FAIL:`);
  for (const e of leftover) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — IntegrityReportsTab surfaces active sub-tab + observations query errors`);
