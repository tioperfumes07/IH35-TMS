#!/usr/bin/env node
// NAMES-MASTER-DOUBLE-PAGER-CONTRADICTS-TOTAL — guard
//
// /lists/names (Names Master cross-module search) feeds ONE server-paginated page (limit/offset,
// pageSize=50) into <ParityTable rows={rows} ...> and ALSO renders its own correct external pager
// ("Page {page+1} of {pageCount} · {total} results") below it. Without hidePager, ParityTable's
// built-in pager computed its own "of N" / "Page X of Y" from rows.length alone (always 50, always
// "Page 1 of 1") -- flatly contradicting the correct external pager on the same screen (live-observed:
// internal pager said "1-50 of 50 · Page 1 of 1" while the external one said "Page 1 of 3 · 119
// results"). This guard fails if NamesMasterHub.tsx's ParityTable stops passing hidePager.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const FILE = "apps/frontend/src/pages/lists/names/NamesMasterHub.tsx";

export function check(text) {
  const failures = [];
  const idx = text.indexOf("<ParityTable<NamesMasterRow>");
  const block = idx >= 0 ? text.slice(idx, idx + 900) : "";
  if (!/\bhidePager\b/.test(block)) {
    failures.push(`${FILE} ParityTable no longer passes hidePager -- its built-in pager will contradict the external server-total pager below it again`);
  }
  if (!/pageSize=\{pageSize\}/.test(block)) {
    failures.push(`${FILE} ParityTable no longer passes pageSize={pageSize} (the server page size) -- required alongside hidePager per ParityTable's own documented server-paged recipe`);
  }
  return failures;
}

function run() {
  const text = fs.readFileSync(path.join(root, FILE), "utf8");
  const failures = check(text);
  if (failures.length > 0) {
    console.error("FAIL: names-master-hub-single-pager");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: Names Master Hub's ParityTable defers to the single, correct, server-total-driven external pager (hidePager set)");
}

function selftest() {
  const text = fs.readFileSync(path.join(root, FILE), "utf8");
  const offender = text.replace(
    /pageSize=\{pageSize\}([\s\S]*?)hidePager\n/,
    "initialPageSize={50}$1",
  );
  if (offender === text) {
    console.error("FAIL(selftest): offender mutation did not change the source — pattern out of sync");
    process.exit(1);
  }
  const failures = check(offender);
  if (failures.length === 0) {
    console.error("FAIL(selftest): planted offender (hidePager + pageSize removed, reverted to initialPageSize) was NOT caught");
    process.exit(1);
  }
  console.log("PASS(selftest): planted regression correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
