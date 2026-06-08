#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

function expectFile(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`MISSING: ${relativePath}`);
  }
}

function expectContains(relativePath, pattern, label) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`MISSING: ${relativePath}`);
    return;
  }
  const text = fs.readFileSync(absolutePath, "utf8");
  if (!pattern.test(text)) {
    failures.push(`${relativePath}: missing ${label}`);
  }
}

expectFile("tests/load/dispatch-board-realtime.js");
expectFile("tests/load/driver-pwa-sync.js");
expectFile("tests/load/invoice-creation-burst.js");
expectFile("tests/load/qbo-sync-backlog.js");
expectFile("db/migrations/202606080205_load_test_runs.sql");
expectFile(".github/workflows/load-test-nightly.yml");

expectContains("package.json", /"verify:load-test-baseline"\s*:/, "verify:load-test-baseline script");
expectContains(".github/workflows/ci.yml", /verify:load-test-baseline/, "CI gate step");

if (failures.length > 0) {
  console.error("verify:load-test-baseline FAIL");
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log("verify:load-test-baseline PASS");
