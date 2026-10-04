#!/usr/bin/env node
// AUTH-400 writer fix (CC-1, 2026-10-04) — a void reversal leg carries ITS original line's source, never the voided
// document's. Measured live: 24 invoice voids reversed a load-sourced 1150 unbilled leg and wrote the reversal sourced
// `invoice` (GL balanced; per-source views wrong — load profitability, unbilled-by-load, per-document drill-downs).
//
// static (read-only): in apps/backend/src/accounting/void.service.ts
//   1. BOTH readOriginalGlPostings SELECTs read source_transaction_type, source_transaction_id per line;
//   2. flipPostingsForReversal carries both onto the reversal line;
//   3. postVoidReversal writes the line's source through reversalLineSource(line, trueType, trueId) — never a bare
//      `source_transaction_type: trueType` — and reversalLineSource keeps a real own source, falls back only for a
//      sourceless line or a journal_entry hop, and refuses (void_reversal_line_source_unresolved) otherwise.
// The two-sided MIXED-source document is planted in apps/backend/src/accounting/void.service.test.ts (vitest; red on
// main's writer, green on this one). --selftest plants the regressions below into the source and asserts each is caught.
import { readFileSync } from "node:fs";

const LABEL = "verify-void-reversal-keeps-line-source";
const FILE = "apps/backend/src/accounting/void.service.ts";
const TEST = "apps/backend/src/accounting/void.service.test.ts";
const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

export function problems(src, test) {
  const p = [];
  const selects = src.match(/debit_or_credit, amount_cents::bigint AS amount_cents, description, line_sequence,\s*\n\s*source_transaction_type, source_transaction_id/g) ?? [];
  if (selects.length !== 2) p.push(`readOriginalGlPostings: ${selects.length}/2 SELECTs read the line's own source_transaction_type/id`);
  const flip = src.slice(src.indexOf("export function flipPostingsForReversal("), src.indexOf("export function reversalLineSource("));
  if (!/source_transaction_type: row\.source_transaction_type \?\? null/.test(flip) || !/source_transaction_id: row\.source_transaction_id \?\? null/.test(flip)) p.push("flipPostingsForReversal does not carry the original line's source");
  const fn = src.slice(src.indexOf("export function reversalLineSource("), src.indexOf("export function reversalLineSource(") + 1200);
  if (!/if \(own && own !== "journal_entry" && line\.source_transaction_id\)/.test(fn)) p.push("reversalLineSource must keep a real own source (not a journal_entry hop)");
  if (!/void_reversal_line_source_unresolved/.test(fn)) p.push("reversalLineSource must refuse when no source resolves");
  const post = src.slice(src.indexOf("export async function postVoidReversal("));
  if (!/\.\.\.reversalLineSource\(line, trueType, trueId\),/.test(post)) p.push("postVoidReversal must write each line's source via reversalLineSource(line, trueType, trueId)");
  if (/source_transaction_type: trueType,/.test(post)) p.push("postVoidReversal stamps trueType on a reversal line (the relabel defect)");
  if (!/two-sided, MIXED sources/.test(test) || !/source_transaction_type: "load", source_transaction_id: "load-13539"/.test(test)) p.push("void.service.test.ts must plant the two-sided mixed-source document");
  return p;
}

const src = read(FILE);
const test = read(TEST);
const own = problems(src, test);
const plants = [
  ["writer stamps trueType again", src.replace("...reversalLineSource(line, trueType, trueId),", "source_transaction_type: trueType,\n      source_transaction_id: trueId,")],
  ["flip drops the source", src.replace("source_transaction_type: row.source_transaction_type ?? null,", "")],
  ["one SELECT without source", src.replace(/line_sequence,\s*\n\s*source_transaction_type, source_transaction_id/, "line_sequence")],
  ["journal_entry hop kept as own source", src.replace('own && own !== "journal_entry" && line.source_transaction_id', "own && line.source_transaction_id")],
  ["no refusal", src.replace(/throw Object\.assign\(new Error\("void_reversal_line_source_unresolved"\)[^\n]*/, "return { source_transaction_type: '', source_transaction_id: '' };")],
];
const missed = plants.filter(([, s]) => problems(s, test).length === 0).map(([n]) => n);
if (own.length || missed.length) {
  console.error(`${LABEL}: FAIL — ${[...own, ...missed.map((n) => `plant '${n}' not caught`)].join("; ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — every reversal leg keeps its own source (${plants.length}/${plants.length} plants caught; mixed-source document planted in void.service.test.ts)`);
