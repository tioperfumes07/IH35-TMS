#!/usr/bin/env node
// LEGAL-MATTERS-DOUBLE-PAGER-CONTRADICTS-TOTAL — guard (same class as
// NAMES-MASTER-DOUBLE-PAGER-CONTRADICTS-TOTAL, #16438)
//
// /legal/matters is genuinely server-paginated (limit/offset, PAGE_SIZE=100) and already renders its
// own correct external pager ("Showing X-Y of Z" + Previous/Next, driven by the real server `total`).
// The <ParityTable rows={rows} ...> it renders the current page's rows through was never told about
// that pagination state -- without hidePager, ParityTable's own built-in pager computes its "of N" /
// "Page X of Y" purely from rows.length, which will contradict the correct external pager the moment
// real matters exceed one page (currently masked at 7 real rows < PAGE_SIZE=100). This guard fails if
// the ParityTable call stops passing hidePager + the server page size.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const FILE = "apps/frontend/src/pages/legal/matters/LegalMattersListPage.tsx";

export function check(text) {
  const failures = [];
  const idx = text.indexOf("<ParityTable");
  const block = idx >= 0 ? text.slice(idx, idx + 1500) : "";
  if (!/\bhidePager\b/.test(block)) {
    failures.push(`${FILE} ParityTable no longer passes hidePager -- its built-in pager will contradict the external "Showing X-Y of Z" pager above it once matters exceed one page`);
  }
  if (!/pageSize=\{PAGE_SIZE\}/.test(block)) {
    failures.push(`${FILE} ParityTable no longer passes pageSize={PAGE_SIZE} (the server page size) -- required alongside hidePager per ParityTable's own documented server-paged recipe`);
  }
  return failures;
}

function run() {
  const text = fs.readFileSync(path.join(root, FILE), "utf8");
  const failures = check(text);
  if (failures.length > 0) {
    console.error("FAIL: legal-matters-single-pager");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: Legal Matters list defers to the single, correct, server-total-driven external pager (hidePager set)");
}

function selftest() {
  const text = fs.readFileSync(path.join(root, FILE), "utf8");
  const offender = text.replace(/\n\s*pageSize=\{PAGE_SIZE\}\n\s*hidePager\n/, "\n");
  if (offender === text) {
    console.error("FAIL(selftest): offender mutation did not change the source — pattern out of sync");
    process.exit(1);
  }
  const failures = check(offender);
  if (failures.length === 0) {
    console.error("FAIL(selftest): planted offender (hidePager + pageSize removed) was NOT caught");
    process.exit(1);
  }
  console.log("PASS(selftest): planted regression correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
