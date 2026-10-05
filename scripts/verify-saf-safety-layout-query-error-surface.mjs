#!/usr/bin/env node
/**
 * verify-saf-safety-layout-query-error-surface
 * SAF-SAFETY-LAYOUT-QUERY-ERROR — prefs/kpis/csa query failures must not look empty/zero.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-saf-safety-layout-query-error-surface";
const FILE = "apps/frontend/src/pages/safety/SafetyLayout.tsx";
const NEEDLES = [
  "userFacingApiError",
  "prefsQuery.isError",
  "kpisQuery.isError",
  "csaQuery.isError",
  "safety-prefs-query-error",
  "safety-layout-query-error",
  "safety-kpis-query-error",
  "safety-csa-query-error",
];

function assertFile(rel, needles) {
  const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  return needles.filter((n) => !src.includes(n)).map((n) => `${rel}: missing ${n}`);
}

function leftoverErrors(src) {
  const errors = [];
  if (src.includes("text-[11px]")) errors.push("leftover text-[11px]");
  if (src.includes("#8A92AB") || src.includes("#334155")) errors.push("leftover off-scale muted");
  if (src.includes("text-slate-") || src.includes("border-slate-") || src.includes("bg-slate-") || src.includes("hover:bg-slate-") || src.includes("hover:text-slate-")) {
    errors.push("leftover slate class");
  }
  return errors;
}

function selftest() {
  const bad = `<SafetyKpiRow kpis={kpisQuery.data} />`;
  const good = NEEDLES.join("\n");
  const tmp = path.join(process.cwd(), ".tmp-safety-layout-query-selftest.tsx");
  fs.writeFileSync(tmp, bad);
  try {
    if (assertFile(".tmp-safety-layout-query-selftest.tsx", ["kpisQuery.isError"]).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL bad`);
      process.exit(1);
    }
  } finally {
    fs.unlinkSync(tmp);
  }
  fs.writeFileSync(tmp, good);
  try {
    if (assertFile(".tmp-safety-layout-query-selftest.tsx", NEEDLES).length > 0) {
      console.error(`${LABEL} SELFTEST FAIL good`);
      process.exit(1);
    }
  } finally {
    fs.unlinkSync(tmp);
  }
  const leftover = leftoverErrors(`${good}\n<div className="text-[11px] text-slate-600 bg-slate-50 hover:text-slate-700 text-[#8A92AB]">plant</div>`);
  if (
    !leftover.includes("leftover text-[11px]") ||
    !leftover.includes("leftover off-scale muted") ||
    !leftover.includes("leftover slate class")
  ) {
    console.error(`${LABEL} SELFTEST FAIL leftover plant escaped`, leftover);
    process.exit(1);
  }
  console.log(`${LABEL} selftest PASS leftover slate class plant`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

if (!fs.existsSync(path.join(process.cwd(), FILE))) {
  console.error(`${LABEL} FAIL: missing ${FILE}`);
  process.exit(1);
}
const src = fs.readFileSync(path.join(process.cwd(), FILE), "utf8");
const errors = [
  ...assertFile(FILE, NEEDLES),
  ...leftoverErrors(src).map((e) => `${FILE}: ${e}`),
];
if (errors.length) {
  console.error(`${LABEL} FAIL:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — SafetyLayout surfaces prefs/kpis/csa query isError`);
