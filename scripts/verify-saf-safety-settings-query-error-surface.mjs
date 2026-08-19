#!/usr/bin/env node
/**
 * verify-saf-safety-settings-query-error-surface
 * SAF-SAFETY-SETTINGS-QUERY-ERROR — settingsQuery fail must not look like "Settings not found."
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-saf-safety-settings-query-error-surface";
const FILE = "apps/frontend/src/pages/safety/SafetySettingsPage.tsx";
const NEEDLES = [
  "ListErrorState",
  "settingsQuery.isError",
  "safety-settings-query-error",
  "Couldn't load Safety settings",
  "userFacingApiError",
];

function assertFile(rel, needles) {
  const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  return needles.filter((n) => !src.includes(n)).map((n) => `${rel}: missing ${n}`);
}

function selftest() {
  const bad = `if (!settingsQuery.data) return <div className="text-sm text-gray-500">Settings not found.</div>;`;
  const good = NEEDLES.join("\n");
  const tmp = path.join(process.cwd(), ".tmp-safety-settings-query-selftest.tsx");
  fs.writeFileSync(tmp, bad);
  try {
    if (assertFile(".tmp-safety-settings-query-selftest.tsx", ["settingsQuery.isError"]).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL bad`);
      process.exit(1);
    }
  } finally {
    fs.unlinkSync(tmp);
  }
  fs.writeFileSync(tmp, good);
  try {
    if (assertFile(".tmp-safety-settings-query-selftest.tsx", NEEDLES).length > 0) {
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
console.log(`${LABEL} PASS — SafetySettingsPage surfaces settingsQuery.isError`);
