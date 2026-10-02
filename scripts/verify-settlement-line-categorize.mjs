#!/usr/bin/env node
// ROUND 326 queue item 10 (G-05, CC-1) — ONE settlement-line categorizer. Lines reached close with item_id,
// posting_account_id and category NULL. This guard fails if:
//   1. either close (closeSettlementPayRun, the load-bookended close) stops running categorizeSettlementLines;
//   2. the categorizer stops reusing backfillExistingSettlementLineAccounts for accounts (a second rule set), or
//      resolves items any way but the catalog map (matchSettlementPdfItem) — a name lookup or a guess;
//   3. it writes anything but NULL columns (an UPDATE without the IS NULL predicate), changes an amount, or inserts.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-settlement-line-categorize";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = {
  cat: "apps/backend/src/driver-finance/settlement-line-categorize.service.ts",
  close: "apps/backend/src/driver-finance/settlement-payrun-close.service.ts",
  bookended: "apps/backend/src/driver-finance/settlements-load-bookended.service.ts",
};
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

export function problems(src) {
  const p = [];
  if (!/input\.previewOnly !== true\) await categorizeSettlementLines\(client/.test(strip(src.close))) p.push("closeSettlementPayRun must run categorizeSettlementLines before it reads the lines");
  if (!/await categorizeSettlementLines\(client/.test(strip(src.bookended))) p.push("the load-bookended close must run categorizeSettlementLines");
  const cat = strip(src.cat);
  if (!/await backfillExistingSettlementLineAccounts\(client, input\)/.test(cat)) p.push("accounts must come from backfillExistingSettlementLineAccounts (one rule set)");
  if (!/matchSettlementPdfItem\(/.test(cat)) p.push("items must come from the catalog map (matchSettlementPdfItem)");
  if (/FROM catalogs\.items|item_name\s*=/.test(cat)) p.push("the categorizer looks items up by name");
  if (/INSERT INTO|SET amount|DELETE FROM/.test(cat)) p.push("the categorizer may only fill NULL columns — no insert, no amount change, no delete");
  for (const m of cat.matchAll(/UPDATE driver_finance\.settlement_lines[\s\S]*?`/g)) {
    if (!/(category|item_id) IS NULL/.test(m[0])) p.push("every categorizer UPDATE must be guarded by its column IS NULL");
  }
  return p;
}

export function run() {
  return problems(Object.fromEntries(Object.entries(F).map(([k, v]) => [k, readFileSync(path.join(ROOT, v), "utf8")])));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const src = Object.fromEntries(Object.entries(F).map(([k, v]) => [k, readFileSync(path.join(ROOT, v), "utf8")]));
  const own = problems(src);
  if (process.argv.includes("--selftest")) {
    if (own.length) { console.error(`${LABEL} --selftest FAIL on the real tree — ${own.join("; ")}`); process.exit(1); }
    const plants = [
      ["close skips it", { ...src, close: src.close.replace("await categorizeSettlementLines(client", "void (client") }],
      ["name lookup", { ...src, cat: src.cat + "\nconst q = `SELECT id FROM catalogs.items WHERE item_name = $1`;" }],
      ["overwrite", { ...src, cat: src.cat.replace("AND category IS NULL`", "`") }],
    ];
    for (const [name, planted] of plants) {
      if (!problems(planted).length) { console.error(`${LABEL} --selftest FAIL — plant "${name}" not caught`); process.exit(1); }
    }
    console.log(`${LABEL} --selftest PASS (real tree clean; ${plants.length}/${plants.length} plants caught)`);
    process.exit(0);
  }
  if (own.length) { console.error(`${LABEL}: FAIL — ${own.join("; ")}`); process.exit(1); }
  console.log(`${LABEL}: OK — both closes categorize every line (accounts by the one rule set, items by the catalog map, NULL columns only).`);
}
