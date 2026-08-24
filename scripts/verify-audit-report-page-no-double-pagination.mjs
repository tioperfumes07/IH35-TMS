#!/usr/bin/env node
/**
 * REPORTS-F6363 — /reports/audit/activity-by-user (and its 6 siblings, all built on the shared
 * `AuditReportPage`) showed TWO independent, conflicting pagination controls on one table:
 * ParityTable's own uncontrolled client-side pager ("1-15 of 100 ... Page 1 of 7", slicing the
 * 100-row server batch into its own 15-per-page pages) stacked directly above AuditReportPage's
 * real server-driven "Prev / Page 1 of 3 / Next" pager (offset/PAGE_SIZE=100). Clicking the real
 * (bottom) pager fetches a brand-new 100-row batch, but the top pager's own page/count state does
 * not know that happened -- it keeps showing a stale "Page 1 of 7" / "1-15 of 100" label against
 * whatever slice of the NEW batch it happens to still be sitting on. Silent, misleading UI state,
 * not a 500 -- but a genuine confusing-double-control defect on every one of the 7 audit report
 * pages that share this component.
 *
 * ParityTable's own docs name the fix directly (components/parity/ParityTable.tsx, "PAGE SIZE"
 * comment): a caller that already pre-pages server-side must pass `pageSize` (the server page
 * size, so the single batch it hands over is never re-sliced) AND `hidePager` (so only the
 * caller's own real pager renders) -- "no double slicing".
 */
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/reports/audit/AuditReportPage.tsx";
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
  need(/pageSize=\{PAGE_SIZE\}/.test(block), "ParityTable must pass pageSize={PAGE_SIZE} so the server-paged batch handed to it is never re-sliced client-side");
  // The real server pager (offset/PAGE_SIZE-driven Prev/Next) must still exist -- this guard is
  // about killing the DUPLICATE, not the only real one.
  need(/setOffset\(offset \+ PAGE_SIZE\)/.test(text), "the real offset-driven Next handler must still be present");
  need(/setOffset\(Math\.max\(0, offset - PAGE_SIZE\)\)/.test(text), "the real offset-driven Prev handler must still be present");
  return failures;
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-audit-report-page-no-double-pagination FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { name: "drop hidePager", mutate: (t) => t.replace(/\n\s*hidePager\n/, "\n") },
    { name: "drop pageSize={PAGE_SIZE}", mutate: (t) => t.replace(/\n\s*pageSize=\{PAGE_SIZE\}\n/, "\n") },
    { name: "drop real Next handler", mutate: (t) => t.replace("setOffset(offset + PAGE_SIZE)", "setOffset(offset)") },
    { name: "drop real Prev handler", mutate: (t) => t.replace("setOffset(Math.max(0, offset - PAGE_SIZE))", "setOffset(offset)") },
  ];
  let caught = 0;
  for (const { name, mutate } of mutations) {
    const mutated = mutate(source);
    if (mutated === source) throw new Error(`mutation "${name}" did not change the source -- test is inert`);
    if (audit(mutated).length === 0) throw new Error(`mutation escaped: "${name}" was not caught`);
    caught += 1;
  }
  console.log(`verify-audit-report-page-no-double-pagination SELFTEST PASS — ${caught}/${mutations.length} mutations detected`);
}

console.log("verify-audit-report-page-no-double-pagination PASS — ParityTable is hidePager+pageSize-pinned, real offset pager intact, no duplicate/conflicting pagination across the 7 audit report pages");
