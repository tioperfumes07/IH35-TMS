#!/usr/bin/env node
/**
 * LEAD 443.185 G8 — every posting carries load_id + entity when its source document has them; one rule, in the
 * posting line writer (posting-line-writer.ts writeLine → resolvePostingSourceEntity / resolvePostingSourceLoad, backed
 * by accounting.posting_source_load_id()).
 *
 * Measured on prod (USMCA, read-only) before this step: factoring_advance 155 lines / 25 advances — 155 with NO load
 * and NO party (fuel_event, driver_advance, bank_categorization: every load their document carries was on the line).
 *   1. factoring_advance is a party-from-document source: its party is the factoring company vendor.
 *   2. resolvePostingSourceLoad covers factoring_advance: source_load_id, else the ONE load its live invoices name
 *      (several loads = none, never a guess).
 *   3. writeLine still derives entity then load for every line the caller left blank.
 * --selftest plants each regression.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WRITER = "apps/backend/src/accounting/posting-line-writer.ts";

export function check(writer = readFileSync(resolve(ROOT, WRITER), "utf8")) {
  const p = [];
  const fromDoc = writer.match(/export const PARTY_FROM_DOCUMENT_SOURCE_TYPES = \[[\s\S]*?\] as const;/)?.[0] ?? "";
  const partyless = writer.match(/export const PARTYLESS_SOURCE_TYPES = \[[\s\S]*?\] as const;/)?.[0] ?? "";
  if (!/"factoring_advance"/.test(fromDoc) || /"factoring_advance"[,\s]/.test(partyless)) p.push(`${WRITER}: factoring_advance must be a party-from-document source (1)`);
  if (!/factoring_advance: `SELECT factoring_company_vendor_id::text AS e, 'vendor' AS t FROM accounting\.factoring_advances/.test(writer))
    p.push(`${WRITER}: resolvePostingSourceEntity must name the factoring company vendor on a factoring_advance line (1)`);
  const load = writer.match(/export async function resolvePostingSourceLoad\([\s\S]*?\n\}/)?.[0] ?? "";
  if (!/line\.source_transaction_type === "factoring_advance"/.test(load) || !/HAVING count\(DISTINCT i\.source_load_id\) = 1/.test(load) || !/a\.source_load_id/.test(load))
    p.push(`${WRITER}: resolvePostingSourceLoad must carry a factoring advance's one load (source_load_id, else its invoices' single load) (2)`);
  if (!/const derived = await resolvePostingSourceEntity\(client, line\)/.test(writer) || !/const load = await resolvePostingSourceLoad\(client, line\)/.test(writer))
    p.push(`${WRITER}: writeLine must derive entity and load for every line the caller left blank (3)`);
  return p;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain && process.argv.includes("--selftest")) {
  const base = readFileSync(resolve(ROOT, WRITER), "utf8");
  if (check(base).length) {
    console.error("SELFTEST FAIL: baseline not clean", check(base));
    process.exit(1);
  }
  const plants = [
    ["advance back to party-less", base.replace('  "factoring_advance",\n  // its poster', "  // its poster").replace('"load", "factoring_advance_deposit"', '"load", "factoring_advance", "factoring_advance_deposit"')],
    ["no factor entity", base.replace("factoring_advance: `SELECT factoring_company_vendor_id", "factoring_advance_x: `SELECT factoring_company_vendor_id")],
    ["advance load dropped", base.replace('line.source_transaction_type === "factoring_advance"', 'line.source_transaction_type === "factoring_advance_x"')],
    ["load guessed across loads", base.replace("HAVING count(DISTINCT i.source_load_id) = 1", "HAVING count(DISTINCT i.source_load_id) >= 1")],
  ];
  for (const [n, src] of plants) {
    if (!check(src).length) {
      console.error(`SELFTEST FAIL: plant "${n}" not caught`);
      process.exit(1);
    }
  }
  console.log(`SELFTEST PASS: ${plants.length} plants caught`);
  process.exit(0);
}
if (isMain) {
  const p = check();
  if (p.length) {
    console.error(`verify-posting-lines-carry-source-load FAIL (${p.length}):`);
    for (const x of p) console.error(`  ${x}`);
    process.exit(1);
  }
  console.log("verify-posting-lines-carry-source-load PASS: factoring advance lines carry the factor + their one load; one rule in the line writer (G8)");
}
