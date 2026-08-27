#!/usr/bin/env node
// PARITYTABLE-MISSING-HIDEPAGER-CLASS — Safety Position History slice.
//
// This page fetches one server page using limit/offset and renders the authoritative external
// Previous/Next pager from the server total. ParityTable must not paginate that page a second time.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/pages/safety/PositionHistoryPage.tsx";

export function check(text) {
  const failures = [];
  const start = text.indexOf("<ParityTable<PositionHistoryRecord>");
  const block = start >= 0 ? text.slice(start, start + 900) : "";

  if (!/pageSize=\{limit\}/.test(block)) {
    failures.push(`${FILE}: ParityTable must use the same limit as the server page`);
  }
  if (!/\bhidePager\b/.test(block)) {
    failures.push(`${FILE}: ParityTable must hide its internal pager when the server pager is authoritative`);
  }
  if (!/total > limit[\s\S]{0,900}>\s*Previous\s*</.test(text)) {
    failures.push(`${FILE}: authoritative server-total Previous/Next pager is missing`);
  }
  return failures;
}

const source = fs.readFileSync(path.join(root, FILE), "utf8");

if (process.argv.includes("--selftest")) {
  const planted = source.replace(/pageSize=\{limit\}([\s\S]{0,120})hidePager/, "initialPageSize={limit}$1");
  if (planted === source || check(planted).length < 2) {
    console.error("FAIL(selftest): planted double-pager regression escaped detection");
    process.exit(1);
  }
  console.log("PASS(selftest): planted double-pager regression detected");
  process.exit(0);
}

const failures = check(source);
if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}
console.log("PASS: Safety Position History uses one server-total-driven pager");
