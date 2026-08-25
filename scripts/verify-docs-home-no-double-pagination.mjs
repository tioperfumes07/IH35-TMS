#!/usr/bin/env node
/**
 * DOCS-F-PARITYTABLE-DOUBLE-PAGINATION — /docs (DocsHomePage) showed TWO independent, conflicting
 * pagination controls on one table: ParityTable's own uncontrolled client-side pager re-derives
 * "total" from the `rows` array it was handed (the current 25-row server page), so it rendered a
 * second, contradictory "1-25 of 25 ... Page 1 of 1" pager (all nav disabled) directly above
 * DocsHomePage's own real server-driven "Page {page} of {totalPages} · {total} total" pager. A
 * user reading the top pager would wrongly conclude there are no more documents beyond page 1
 * (25 total) even though the real pager below correctly shows "79 total" across 4 pages. Same bug
 * class as REPORTS-F6363 (AuditReportPage.tsx, already fixed) — a different producer of the same
 * missing hidePager/pageSize combo, live-confirmed Chrome USMCA /docs (79 real docs, top pager
 * showed "1-25 of 25 / Page 1 of 1" with every nav control disabled).
 *
 * ParityTable's own docs name the fix directly (components/parity/ParityTable.tsx, "PAGE SIZE"
 * comment): a caller that already pre-pages server-side must pass `pageSize` (the server page
 * size, so the single batch it hands over is never re-sliced) AND `hidePager` (so only the
 * caller's own real pager renders) -- "no double slicing".
 */
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/docs/DocsHomePage.tsx";
const source = fs.readFileSync(FILE, "utf8");

function paritytableBlock(text) {
  const start = text.indexOf("<ParityTable");
  const end = text.indexOf("/>", text.indexOf("filterBar={", start));
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
  need(block.length > 0, "<ParityTable ...> block not found");
  need(/\bhidePager\b/.test(block), "ParityTable must pass hidePager so its own uncontrolled pager never renders alongside the real server pager below");
  need(/pageSize=\{limit\}/.test(block), "ParityTable must pass pageSize={limit} so the server-paged batch handed to it is never re-sliced client-side");
  // The real server pager (page/totalPages-driven Previous/Next) must still exist -- this guard
  // is about killing the DUPLICATE, not the only real one.
  need(/setPage\(\(current\) => Math\.min\(totalPages, current \+ 1\)\)/.test(text), "the real totalPages-driven Next handler must still be present");
  need(/setPage\(\(current\) => Math\.max\(1, current - 1\)\)/.test(text), "the real totalPages-driven Previous handler must still be present");
  return failures;
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-docs-home-no-double-pagination FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { name: "drop hidePager", mutate: (t) => t.replace(/\n\s*hidePager\n/, "\n") },
    { name: "drop pageSize={limit}", mutate: (t) => t.replace(/\n\s*pageSize=\{limit\}\n/, "\n") },
    { name: "drop real Next handler", mutate: (t) => t.replace("setPage((current) => Math.min(totalPages, current + 1))", "setPage((current) => current)") },
    { name: "drop real Previous handler", mutate: (t) => t.replace("setPage((current) => Math.max(1, current - 1))", "setPage((current) => current)") },
  ];
  let caught = 0;
  for (const { name, mutate } of mutations) {
    const mutated = mutate(source);
    if (mutated === source) throw new Error(`mutation "${name}" did not change the source -- test is inert`);
    if (audit(mutated).length === 0) throw new Error(`mutation escaped: "${name}" was not caught`);
    caught += 1;
  }
  console.log(`verify-docs-home-no-double-pagination SELFTEST PASS — ${caught}/${mutations.length} mutations detected`);
}

console.log("verify-docs-home-no-double-pagination PASS — ParityTable is hidePager+pageSize-pinned, real page pager intact, no duplicate/conflicting pagination on /docs");
