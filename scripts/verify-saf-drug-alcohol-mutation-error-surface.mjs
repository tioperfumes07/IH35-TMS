#!/usr/bin/env node
/**
 * verify-saf-drug-alcohol-mutation-error-surface
 * SAF-DRUG-ALCOHOL-MUTATION-SILENT-FAIL — createTest / openRtd / advanceRtd
 * must surface mutation.isError (not silent no-ops).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-saf-drug-alcohol-mutation-error-surface";
const FILE = "apps/frontend/src/pages/safety/tabs/DrugAlcoholTab.tsx";
const NEEDLES = [
  "userFacingApiError",
  "createTestMutation.isError",
  "openRtdMutation.isError",
  "advanceRtdMutation.isError",
  "drug-alcohol-create-test-error",
  "drug-alcohol-open-rtd-error",
  "drug-alcohol-advance-rtd-error",
];

function assertFile(rel, needles) {
  const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  return needles.filter((n) => !src.includes(n)).map((n) => `${rel}: missing ${n}`);
}

function selftest() {
  const bad = `onClick={() => createTestMutation.mutate()}`;
  const good = NEEDLES.join("\n");
  const tmp = path.join(process.cwd(), ".tmp-drug-alcohol-selftest.tsx");
  fs.writeFileSync(tmp, bad);
  try {
    if (assertFile(".tmp-drug-alcohol-selftest.tsx", ["createTestMutation.isError"]).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL bad`);
      process.exit(1);
    }
  } finally {
    fs.unlinkSync(tmp);
  }
  fs.writeFileSync(tmp, good);
  try {
    if (assertFile(".tmp-drug-alcohol-selftest.tsx", NEEDLES).length > 0) {
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
console.log(`${LABEL} PASS — DrugAlcohol createTest/openRtd/advanceRtd surface isError`);
