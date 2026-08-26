#!/usr/bin/env node
/**
 * ACCT-F-PARITYTABLE-DOUBLE-PAGINATION (5th producer) — `/factoring/reserves` (ReserveDashboard)
 * "Reserve Balance Over Time" section rendered TWO independent, conflicting pagination controls
 * on one table. ParityTable's own uncontrolled pager re-derives "total" from the `rows` array it
 * was handed (the current `pageSize`-row server page, offset-driven via the page state below),
 * so it rendered a second, contradictory pager directly above ReserveDashboard's own real
 * server-driven "Page {page+1} of {totalPages}" Prev/Next pager. No real reserve-movement data
 * currently exists for the only factor on file to demonstrate the live discrepancy the way the
 * four prior instances this session could (all showed "N of N" vs a real larger total) -- but the
 * source shape is identical to those four already-proven, already-fixed occurrences
 * (REPORTS-F6363, DOCS-F-PARITYTABLE-DOUBLE-PAGINATION, ADMIN-F-PARITYTABLE-DOUBLE-PAGINATION,
 * ACCT-F6433), so the fix is applied on pattern-match confidence, not a live discrepancy screenshot.
 *
 * ParityTable's own docs name the fix directly (components/parity/ParityTable.tsx, "PAGE SIZE"
 * comment): a caller that already pre-pages server-side must pass `pageSize` (the server page
 * size, so the single batch it hands over is never re-sliced) AND `hidePager` (so only the
 * caller's own real pager renders) -- "no double slicing".
 */
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/factoring/ReserveDashboard.tsx";
const source = fs.readFileSync(FILE, "utf8");

function paritytableBlock(text) {
  const start = text.indexOf("<ParityTable");
  const end = text.indexOf("/>", text.indexOf("storageKey=\"factoring-reserve-balance-history\"", start));
  const raw = start >= 0 && end > start ? text.slice(start, end) : "";
  // Strip `//`-comment lines so the explanatory comment ABOVE the props (which necessarily
  // names hidePager/pageSize in prose) can never make a mutation that deletes the real prop
  // line pass by accident.
  return raw
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

function audit(text) {
  const failures = [];
  const need = (condition, message) => { if (!condition) failures.push(message); };
  const block = paritytableBlock(text);
  need(block.length > 0, "<ParityTable ...> block (Reserve Balance Over Time) not found");
  need(/\bhidePager\b/.test(block), "ParityTable must pass hidePager so its own uncontrolled pager never renders alongside the real server pager below");
  need(/pageSize=\{pageSize\}/.test(block), "ParityTable must pass pageSize={pageSize} so the server-paged batch handed to it is never re-sliced client-side");
  // The real server pager (page/totalPages-driven Prev/Next) must still exist -- this guard is
  // about killing the DUPLICATE, not the only real one.
  need(/setPage\(\(current\) => Math\.min\(totalPages - 1, current \+ 1\)\)/.test(text), "the real totalPages-driven Next handler must still be present");
  need(/setPage\(\(current\) => Math\.max\(0, current - 1\)\)/.test(text), "the real totalPages-driven Prev handler must still be present");
  return failures;
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-reserve-dashboard-no-double-pagination FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { name: "drop hidePager", mutate: (t) => t.replace(/\n\s*hidePager\n/, "\n") },
    { name: "drop pageSize={pageSize}", mutate: (t) => t.replace(/\n\s*pageSize=\{pageSize\}\n/, "\n") },
    { name: "drop real Next handler", mutate: (t) => t.replace("setPage((current) => Math.min(totalPages - 1, current + 1))", "setPage((current) => current)") },
    { name: "drop real Prev handler", mutate: (t) => t.replace("setPage((current) => Math.max(0, current - 1))", "setPage((current) => current)") },
  ];
  let caught = 0;
  for (const { name, mutate } of mutations) {
    const mutated = mutate(source);
    if (mutated === source) throw new Error(`mutation "${name}" did not change the source -- test is inert`);
    if (audit(mutated).length === 0) throw new Error(`mutation escaped: "${name}" was not caught`);
    caught += 1;
  }
  console.log(`verify-reserve-dashboard-no-double-pagination SELFTEST PASS — ${caught}/${mutations.length} mutations detected`);
}

console.log("verify-reserve-dashboard-no-double-pagination PASS — ParityTable is hidePager+pageSize-pinned, real page pager intact, no duplicate/conflicting pagination on /factoring/reserves");
