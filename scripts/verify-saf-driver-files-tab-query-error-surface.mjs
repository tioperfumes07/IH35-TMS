#!/usr/bin/env node
/**
 * verify-saf-driver-files-tab-query-error-surface
 * SAF-DRIVER-FILES-TAB-QUERY-ERROR — trainingQuery fail must not look like empty TrainingTable.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-saf-driver-files-tab-query-error-surface";
const FILE = "apps/frontend/src/pages/safety/tabs/DriverFilesTab.tsx";
const NEEDLES = [
  "ListErrorState",
  "trainingQuery.isError",
  "driver-files-training-query-error",
  "Couldn't load training completions",
  "userFacingApiError",
];

function assertFile(rel, needles) {
  const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  return needles.filter((n) => !src.includes(n)).map((n) => `${rel}: missing ${n}`);
}

function selftest() {
  const bad = `<TrainingTable rows={trainingQuery.data?.training_completions ?? []} />`;
  const good = NEEDLES.join("\n");
  const tmp = path.join(process.cwd(), ".tmp-driver-files-query-selftest.tsx");
  fs.writeFileSync(tmp, bad);
  try {
    if (assertFile(".tmp-driver-files-query-selftest.tsx", ["trainingQuery.isError"]).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL bad`);
      process.exit(1);
    }
  } finally {
    fs.unlinkSync(tmp);
  }
  fs.writeFileSync(tmp, good);
  try {
    if (assertFile(".tmp-driver-files-query-selftest.tsx", NEEDLES).length > 0) {
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
console.log(`${LABEL} PASS — DriverFilesTab surfaces trainingQuery.isError`);
