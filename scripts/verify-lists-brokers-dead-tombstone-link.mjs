#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
const LABEL = "verify-lists-brokers-dead-tombstone-link";
const PAGE = "apps/frontend/src/pages/lists/names/BrokersListPage.tsx";
function read() { return fs.readFileSync(path.join(process.cwd(), PAGE), "utf8"); }
function analyze(src) {
  const failures = [];
  if (!/isUnresolvedEntityTombstone/.test(src)) failures.push("must use isUnresolvedEntityTombstone");
  if (!/brokers-list-name-tombstone/.test(src)) failures.push("must render brokers-list-name-tombstone");
  if (/EntityLink kind="customer" id=\{row\.id\} label=\{row\.name\}/.test(src)) failures.push("must not EntityLink raw row.name");
  return failures;
}
function fail(msg) { console.error(`${LABEL} FAIL: ${msg}`); process.exit(1); }
function selftest() {
  const pagePath = path.join(process.cwd(), PAGE);
  const original = fs.readFileSync(pagePath, "utf8");
  try {
    fs.writeFileSync(pagePath, original.replace(/isUnresolvedEntityTombstone/g, "NO").replace("brokers-list-name-tombstone", "brokers-list-name-link"));
    if (!analyze(read()).length) fail("selftest expected fail");
  } finally {
    fs.writeFileSync(pagePath, original);
  }
  if (analyze(read()).length) fail(`selftest expected GOOD`);
  console.log(`${LABEL} selftest PASS`);
}
if (process.argv.includes("--selftest")) { selftest(); process.exit(0); }
const failures = analyze(read());
if (failures.length) fail(failures.join("; "));
console.log(`${LABEL} PASS`);
