#!/usr/bin/env node
/**
 * ACCT-F-PARITYTABLE-DOUBLE-PAGINATION — /accounting/transactions (TransactionRegisterPage)
 * showed TWO independent, conflicting pagination controls on one table. ParityTable's own
 * uncontrolled pager re-derives "total" from the `rows` array it was handed (the current
 * PAGE_SIZE-row server page), so it rendered a second, contradictory "1-100 of 100 / Page 1 of
 * 1" pager (all nav disabled) directly above TransactionRegisterPage's own real server-driven
 * "Page {page+1} of {pageCount}" pager. Live-confirmed on origin/main: the real total was 427
 * transactions across 5 real pages, while ParityTable's own fake pager showed "1-100 of 100" with
 * every nav control disabled -- a false "no more data" impression sitting directly above the real,
 * working pager. Fourth producer of the same class this session (REPORTS-F6363,
 * DOCS-F-PARITYTABLE-DOUBLE-PAGINATION, ADMIN-F-PARITYTABLE-DOUBLE-PAGINATION).
 *
 * ParityTable's own docs name the fix directly (components/parity/ParityTable.tsx, "PAGE SIZE"
 * comment): a caller that already pre-pages server-side must pass `pageSize` (the server page
 * size, so the single batch it hands over is never re-sliced) AND `hidePager` (so only the
 * caller's own real pager renders) -- "no double slicing".
 */
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/accounting/TransactionRegisterPage.tsx";
const source = fs.readFileSync(FILE, "utf8");

function paritytableBlock(text) {
  const start = text.indexOf("<ParityTable");
  const end = text.indexOf("/>", text.indexOf("suppressToolbarSearch", start));
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
  // The real server pager (page/pageCount-driven Previous/Next) must still exist -- this guard
  // is about killing the DUPLICATE, not the only real one.
  need(/setPage\(\(p\) => \(p \+ 1 < pageCount \? p \+ 1 : p\)\)/.test(text), "the real pageCount-driven Next handler must still be present");
  need(/setPage\(\(p\) => Math\.max\(0, p - 1\)\)/.test(text), "the real pageCount-driven Previous handler must still be present");
  return failures;
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-transaction-register-no-double-pagination FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { name: "drop hidePager", mutate: (t) => t.replace(/\n\s*hidePager\n/, "\n") },
    { name: "drop pageSize={PAGE_SIZE}", mutate: (t) => t.replace(/\n\s*pageSize=\{PAGE_SIZE\}\n/, "\n") },
    { name: "drop real Next handler", mutate: (t) => t.replace("setPage((p) => (p + 1 < pageCount ? p + 1 : p))", "setPage((p) => p)") },
    { name: "drop real Previous handler", mutate: (t) => t.replace("setPage((p) => Math.max(0, p - 1))", "setPage((p) => p)") },
  ];
  let caught = 0;
  for (const { name, mutate } of mutations) {
    const mutated = mutate(source);
    if (mutated === source) throw new Error(`mutation "${name}" did not change the source -- test is inert`);
    if (audit(mutated).length === 0) throw new Error(`mutation escaped: "${name}" was not caught`);
    caught += 1;
  }
  console.log(`verify-transaction-register-no-double-pagination SELFTEST PASS — ${caught}/${mutations.length} mutations detected`);
}

console.log("verify-transaction-register-no-double-pagination PASS — ParityTable is hidePager+pageSize-pinned, real page pager intact, no duplicate/conflicting pagination on /accounting/transactions");
