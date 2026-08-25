#!/usr/bin/env node
/**
 * verify-saf-permits-deadline-query-error-surface
 * SAF-PERMITS-DEADLINE-QUERY-ERROR — deadline fetch must throw on !ok and surface deadlineQ.isError.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-saf-permits-deadline-query-error-surface";
const FILE = "apps/frontend/src/pages/safety/Permits.tsx";
const NEEDLES = [
  "userFacingApiError",
  "deadlineQ.isError",
  "permits-2290-deadline-query-error",
  "onRetry={() => void deadlineQ.refetch()}",
  "throw new Error(`request_failed_${res.status}`)",
];

function assertFile(rel, needles) {
  const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  return needles.filter((n) => !src.includes(n)).map((n) => `${rel}: missing ${n}`);
}

function selftest() {
  const good = NEEDLES.join("\n");
  const tmp = path.join(process.cwd(), ".tmp-permits-deadline-selftest.tsx");
  for (const needle of NEEDLES) {
    fs.writeFileSync(tmp, good.replace(needle, "/* planted missing requirement */"));
    try {
      if (assertFile(".tmp-permits-deadline-selftest.tsx", NEEDLES).length === 0) {
        console.error(`${LABEL} SELFTEST FAIL mutation survived: ${needle}`);
        process.exit(1);
      }
    } finally {
      fs.unlinkSync(tmp);
    }
  }
  fs.writeFileSync(tmp, good);
  try {
    if (assertFile(".tmp-permits-deadline-selftest.tsx", NEEDLES).length > 0) {
      console.error(`${LABEL} SELFTEST FAIL good`);
      process.exit(1);
    }
  } finally {
    fs.unlinkSync(tmp);
  }
  console.log(`${LABEL} selftest PASS — ${NEEDLES.length} planted mutations killed`);
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
const errors = assertFile(FILE, NEEDLES);
if (/if\s*\(\s*!res\.ok\s*\)\s*return\s+null/.test(src)) {
  errors.push(`${FILE}: still returns null on !res.ok (silent success)`);
}
if (errors.length) {
  console.error(`${LABEL} FAIL:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — Permits Form 2290 deadline surfaces query errors`);
