#!/usr/bin/env node
/**
 * ADMIN-F-PARITYTABLE-DOUBLE-PAGINATION — /admin/audit-log (AuditLogViewer) showed TWO
 * independent, conflicting pagination controls on one table. ParityTable's own uncontrolled
 * client-side pager re-derives "total" from the `rows` array it was handed (the current
 * PAGE_SIZE=100-row server page), defaulting to its own 15-per-page sub-pagination with real,
 * working Next/Prev/page-number controls — while AuditLogViewer's own real server-driven pager
 * ("Page {currentPage} of {totalPages}", offset/PAGE_SIZE-driven) renders separately below it.
 * Live-confirmed Owner/SuperAdmin `/admin/audit-log`: the real total was 208,800 events across
 * 2,088 real pages, while ParityTable's own fake pager showed "1-25 of 100" with fully clickable
 * navigation — a two-orders-of-magnitude-wrong impression of the dataset size, with two
 * completely independent, uncoordinated Next/Prev controls on the same screen. Same bug class as
 * the already-fixed REPORTS-F6363 (AuditReportPage.tsx) and DOCS-F-PARITYTABLE-DOUBLE-PAGINATION
 * (DocsHomePage.tsx) — a third, unaudited producer of the identical missing hidePager/pageSize
 * combo.
 *
 * ParityTable's own docs name the fix directly (components/parity/ParityTable.tsx, "PAGE SIZE"
 * comment): a caller that already pre-pages server-side must pass `pageSize` (the server page
 * size, so the single batch it hands over is never re-sliced) AND `hidePager` (so only the
 * caller's own real pager renders) -- "no double slicing".
 */
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/admin/audit-log/AuditLogViewer.tsx";
const source = fs.readFileSync(FILE, "utf8");

function paritytableBlock(text) {
  const start = text.indexOf("<ParityTable");
  const end = text.indexOf("/>", text.indexOf("onRowClick={", start));
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
  // The real server pager (offset/PAGE_SIZE-driven Previous/Next) must still exist -- this guard
  // is about killing the DUPLICATE, not the only real one.
  need(/goPage\(applied\.offset \+ PAGE_SIZE\)/.test(text), "the real offset-driven Next handler must still be present");
  need(/goPage\(Math\.max\(0, applied\.offset - PAGE_SIZE\)\)/.test(text), "the real offset-driven Previous handler must still be present");
  return failures;
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-audit-log-viewer-no-double-pagination FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { name: "drop hidePager", mutate: (t) => t.replace(/\n\s*hidePager\n/, "\n") },
    { name: "drop pageSize={PAGE_SIZE}", mutate: (t) => t.replace(/\n\s*pageSize=\{PAGE_SIZE\}\n/, "\n") },
    { name: "drop real Next handler", mutate: (t) => t.replace("goPage(applied.offset + PAGE_SIZE)", "goPage(applied.offset)") },
    { name: "drop real Previous handler", mutate: (t) => t.replace("goPage(Math.max(0, applied.offset - PAGE_SIZE))", "goPage(applied.offset)") },
  ];
  let caught = 0;
  for (const { name, mutate } of mutations) {
    const mutated = mutate(source);
    if (mutated === source) throw new Error(`mutation "${name}" did not change the source -- test is inert`);
    if (audit(mutated).length === 0) throw new Error(`mutation escaped: "${name}" was not caught`);
    caught += 1;
  }
  console.log(`verify-audit-log-viewer-no-double-pagination SELFTEST PASS — ${caught}/${mutations.length} mutations detected`);
}

console.log("verify-audit-log-viewer-no-double-pagination PASS — ParityTable is hidePager+pageSize-pinned, real offset pager intact, no duplicate/conflicting pagination on /admin/audit-log");
