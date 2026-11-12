#!/usr/bin/env node
/**
 * LST-F11163 — the reclassify engine finds the document of a fuel posting for a RELAY fill and for a line that already
 * moved once (it lives on a RECLASSIFICATION entry).
 *
 * Prod 2026-11-11: POST /accounting/reclassify/apply refused all 15 Relay reefer lines of owner ruling 2026-11-09
 * (5015 -> 5000, $9,379.98) with "fuel_event: 0 live expense documents adopt this entry (need exactly 1)". Measured:
 *  - 10 sat on their original entry, whose document points at the fill's fuel RECORD (fuel.fuel_transactions with
 *    relay_fuel_transaction_id = the fill), never at the Relay fill id the posting carries — the lookup matched
 *    e.source_fuel_transaction_id = posting source only;
 *  - 5 sat on a reclassification entry (an earlier move by load); the document adopts the ROOT entry, which the lookup
 *    never walked back to (accounting.reclassify_batch_lines reclass_journal_entry_id -> journal_entry_id).
 * With both, all 15 resolve to exactly one document with exactly one line of the amount.
 *
 * Static contract (apps/backend/src/accounting/reclassify/reclassify.service.ts, rewriteDocumentLine fuel_event branch):
 *  1. A recursive walk over accounting.reclassify_batch_lines from the posting's entry to its root (applied lines only).
 *  2. The adopting-document query is bound to that ROOT entry, not to the posting's own entry.
 *  3. A document matches the fill by its record id, OR by a fuel record whose relay_fuel_transaction_id is the fill,
 *     OR (Relay fill only) by having no record at all.
 *  4. "need exactly 1" stays — an ambiguous or missing document still refuses by name; nothing moves without it.
 * Self-test: node scripts/verify-reclassify-fuel-doc-follows-relay-and-chain.mjs --selftest
 */
/** MATRIX-BUILT-OPTIONAL — static invariant guard; no surface wiring leaf to register. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-reclassify-fuel-doc-follows-relay-and-chain";
const FILE = "apps/backend/src/accounting/reclassify/reclassify.service.ts";

export function check(src) {
  const out = [];
  const i = src.indexOf('if (type === "fuel_event") {\n    // LST-F11163');
  if (i < 0) return ["the fuel_event document branch (LST-F11163) was not found"];
  const branch = src.slice(i, src.indexOf("return rewriteDocumentLine(client, companyId, { ...p, source_transaction_type: \"expense\"", i));
  if (!/WITH RECURSIVE chain\(je, depth\)/.test(branch) || !/accounting\.reclassify_batch_lines bl\s+ON bl\.reclass_journal_entry_id = c\.je/.test(branch) || !/bl\.result = 'applied'/.test(branch))
    out.push("the lookup does not walk a reclassification entry back to its root entry (reclassify_batch_lines)");
  if (!/\[companyId, adoptedEntryId, p\.source_transaction_id/.test(branch))
    out.push("the adopting-document query is not bound to the ROOT entry (adoptedEntryId)");
  if (!/ft\.relay_fuel_transaction_id::text = \$3/.test(branch))
    out.push("a Relay fill's document (through its fuel record) is not matched");
  if (!/e\.source_fuel_transaction_id IS NULL\s+AND EXISTS \(SELECT 1 FROM integrations\.relay_fuel_transactions r/.test(branch))
    out.push("a Relay fill's record-less document (adopted on receipt) is not matched");
  if (!/adopt\.rows\.length !== 1/.test(branch) || !/need exactly 1/.test(branch))
    out.push("the exactly-one-document refusal was weakened");
  return out;
}

function selftest() {
  const src = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  const real = check(src);
  if (real.length) throw new Error(`real tree must pass: ${real.join("; ")}`);
  const plants = [
    ["no chain walk", src.replace("WITH RECURSIVE chain(je, depth)", "WITH chain(je, depth)"), "root entry (reclassify_batch_lines)"],
    ["bound to own entry", src.replace("[companyId, adoptedEntryId, p.source_transaction_id", "[companyId, p.journal_entry_id, p.source_transaction_id"), "ROOT entry"],
    ["no relay record match", src.replace("AND ft.relay_fuel_transaction_id::text = $3)", "AND ft.id::text = $3)"), "through its fuel record"],
    ["no record-less match", src.replace("OR (e.source_fuel_transaction_id IS NULL", "OR (false"), "record-less document"],
    ["exactly-one weakened", src.replace("if (adopt.rows.length !== 1) {", "if (adopt.rows.length === 0) {"), "exactly-one-document"],
  ];
  for (const [name, planted, needle] of plants) {
    if (planted === src) throw new Error(`plant "${name}" did not apply`);
    const r = check(planted);
    if (!r.some((m) => m.includes(needle))) throw new Error(`plant "${name}" was not caught: ${JSON.stringify(r)}`);
  }
  console.log(`${LABEL}: SELFTEST PASS (${plants.length + 1}/${plants.length + 1})`);
}

if (process.argv.includes("--selftest")) {
  try { selftest(); } catch (e) { console.error(`${LABEL}: SELFTEST FAIL — ${e.message}`); process.exit(1); }
} else {
  const out = check(fs.readFileSync(path.join(ROOT, FILE), "utf8"));
  if (out.length) { console.error(`${LABEL}: FAIL (${out.length})`); for (const m of out) console.error(`  - ${m}`); process.exit(1); }
  console.log(`${LABEL}: OK — a Relay fill's document and a moved line's root document both follow the ledger`);
}
