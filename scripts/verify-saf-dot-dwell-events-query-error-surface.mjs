#!/usr/bin/env node
/**
 * verify-saf-dot-dwell-events-query-error-surface
 * SAF-DOT-DWELL-EVENTS-QUERY-ERROR — openEventsQuery failure must not look like "No open DOT dwell follow-ups."
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-saf-dot-dwell-events-query-error-surface";
const FILE = "apps/frontend/src/pages/safety/tabs/DOTInspectionsTab.tsx";
const NEEDLES = [
  "userFacingApiError",
  "openEventsQuery.isError",
  "dot-dwell-events-query-error",
];

function assertFile(rel, needles) {
  const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  return needles.filter((n) => !src.includes(n)).map((n) => `${rel}: missing ${n}`);
}

function selftest() {
  const bad = `No open DOT dwell follow-ups.`;
  const good = NEEDLES.join("\n");
  const tmp = path.join(process.cwd(), ".tmp-dot-dwell-query-selftest.tsx");
  fs.writeFileSync(tmp, bad);
  try {
    if (assertFile(".tmp-dot-dwell-query-selftest.tsx", ["openEventsQuery.isError"]).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL bad`);
      process.exit(1);
    }
  } finally {
    fs.unlinkSync(tmp);
  }
  fs.writeFileSync(tmp, good);
  try {
    if (assertFile(".tmp-dot-dwell-query-selftest.tsx", NEEDLES).length > 0) {
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
console.log(`${LABEL} PASS — DOTInspectionsTab surfaces openEventsQuery.isError`);
