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
console.log(`${LABEL} PASS — SafetyLayout surfaces prefs/kpis/csa query isError`);
