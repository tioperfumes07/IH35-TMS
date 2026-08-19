#!/usr/bin/env node
/**
 * verify-saf-damage-report-detail-query-error-surface
 * SAF-DAMAGE-REPORT-DETAIL-QUERY-ERROR — photosQuery fail must not look like no photos.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-saf-damage-report-detail-query-error-surface";
const FILE = "apps/frontend/src/pages/safety/damage-reports/DamageReportDetail.tsx";
const NEEDLES = [
  "ListErrorState",
  "photosQuery.isError",
  "damage-report-photos-query-error",
  "Couldn't load damage-report photos",
  "userFacingApiError",
];

function assertFile(rel, needles) {
  const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  return needles.filter((n) => !src.includes(n)).map((n) => `${rel}: missing ${n}`);
}

function selftest() {
  const bad = `No EXIF-verified photos attached.`;
  const good = NEEDLES.join("\n");
  const tmp = path.join(process.cwd(), ".tmp-damage-detail-query-selftest.tsx");
  fs.writeFileSync(tmp, bad);
  try {
    if (assertFile(".tmp-damage-detail-query-selftest.tsx", ["photosQuery.isError"]).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL bad`);
      process.exit(1);
    }
  } finally {
    fs.unlinkSync(tmp);
  }
  fs.writeFileSync(tmp, good);
  try {
    if (assertFile(".tmp-damage-detail-query-selftest.tsx", NEEDLES).length > 0) {
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
console.log(`${LABEL} PASS — DamageReportDetail surfaces photosQuery.isError`);
