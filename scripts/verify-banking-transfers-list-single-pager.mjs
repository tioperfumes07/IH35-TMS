#!/usr/bin/env node
// PARITYTABLE-MISSING-HIDEPAGER-CLASS — Banking Transfers List slice.
//
// This page fetches one server page using limit: PAGE_SIZE/offset and renders the authoritative
// external Previous/Next pager gated on hasNext. ParityTable must not paginate that page a
// second time off its own rows.length.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/pages/banking/TransfersListPage.tsx";

export function check(text) {
  const failures = [];
  const start = text.indexOf('tableTestId="banking-transfers-list-table"');
  const block = start >= 0 ? text.slice(Math.max(0, start - 400), start + 900) : "";

  if (!/^\s*pageSize=\{PAGE_SIZE\}\s*$/m.test(block)) {
    failures.push(`${FILE}: ParityTable must use the same PAGE_SIZE as the server page`);
  }
  if (!/^\s*hidePager\s*$/m.test(block)) {
    failures.push(`${FILE}: ParityTable must hide its internal pager when the server pager is authoritative`);
  }
  if (!/disabled=\{!hasNext\}[\s\S]{0,200}>\s*Next\s*</.test(text)) {
    failures.push(`${FILE}: authoritative server-total Previous/Next pager is missing`);
  }
  return failures;
}

const source = fs.readFileSync(path.join(root, FILE), "utf8");

if (process.argv.includes("--selftest")) {
  const planted = source.replace(/pageSize=\{PAGE_SIZE\}([\s\S]{0,80})hidePager/, "initialPageSize={PAGE_SIZE}$1");
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
console.log("PASS: Banking Transfers List uses one server-total-driven pager");
