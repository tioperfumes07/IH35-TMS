#!/usr/bin/env node
// PARITYTABLE-MISSING-HIDEPAGER-CLASS — Invoice Create Modal "from load" picker slice.
//
// This picker fetches one server page using loadPage/pageSize and renders the authoritative
// external Previous/Next pager from the server totalCount. ParityTable must not paginate that
// page a second time off its own rows.length.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/pages/accounting/InvoiceCreateModal.tsx";

export function check(text) {
  const failures = [];
  const start = text.indexOf('tableTestId="invoice-create-from-load-table"');
  const block = start >= 0 ? text.slice(Math.max(0, start - 400), start + 400) : "";

  if (!/^\s*pageSize=\{pageSize\}\s*$/m.test(block)) {
    failures.push(`${FILE}: ParityTable must use the same pageSize as the server page`);
  }
  if (!/^\s*hidePager\s*$/m.test(block)) {
    failures.push(`${FILE}: ParityTable must hide its internal pager when the server pager is authoritative`);
  }
  if (!/loadPage \* pageSize >= totalCount[\s\S]{0,80}>\s*Next\s*</.test(text)) {
    failures.push(`${FILE}: authoritative server-total Previous/Next pager is missing`);
  }
  return failures;
}

const source = fs.readFileSync(path.join(root, FILE), "utf8");

if (process.argv.includes("--selftest")) {
  const planted = source.replace(/pageSize=\{pageSize\}([\s\S]{0,80})hidePager/, "$1");
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
console.log("PASS: Invoice Create Modal's from-load picker uses one server-total-driven pager");
