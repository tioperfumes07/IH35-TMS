#!/usr/bin/env node
// ROUND 326 queue item 11 (G-08, CC-1) — 9000 ASK MY ACCOUNTANT. The one bill-line resolver ignored item_id: a line
// naming a catalog item but carrying no category fell to the uncategorized role and parked. This guard fails if:
//   1. resolveBillLineDebitAccount stops resolving a line's catalog item to the item's default expense account
//      BEFORE the uncategorized tier (or parks an item with no account instead of refusing it by name);
//   2. the poster (posting-engine buildBillLines) stops selecting bl.item_id / passing item_id;
//   3. the draft preview stops passing item_id (preview would differ from the post).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-bill-line-item-account";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = {
  resolver: "apps/backend/src/accounting/bill-account-resolver.ts",
  poster: "apps/backend/src/accounting/posting-engine.service.ts",
  draft: "apps/backend/src/accounting/bill-gl-draft.service.ts",
};
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

export function problems(src) {
  const p = [];
  const r = strip(src.resolver);
  const itemAt = r.indexOf("default_expense_account_id::text AS account_id");
  const uncatAt = r.indexOf('resolveRoleAccountOptional(client, operatingCompanyId, "uncategorized_expense")');
  if (itemAt < 0) p.push("the bill-line resolver must resolve a line's catalog item to the item's default expense account");
  else if (uncatAt >= 0 && itemAt > uncatAt) p.push("the item tier must run before the uncategorized tier");
  if (!/"ITEM_ACCOUNT_MISSING"/.test(r)) p.push("an item with no account must be refused by name (ITEM_ACCOUNT_MISSING), never parked");
  const poster = strip(src.poster);
  if (!/bl\.item_id::text AS item_id/.test(poster) || !/item_id: row\.item_id/.test(poster)) p.push("the bill poster must select bl.item_id and pass it to the resolver");
  if (!/item_id: line\.item_id \?\? null/.test(strip(src.draft))) p.push("the bill draft preview must pass item_id (preview == post)");
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
      ["item tier removed", { ...src, resolver: src.resolver.replace("default_expense_account_id::text AS account_id", "NULL AS account_id") }],
      ["poster drops item", { ...src, poster: src.poster.replace("item_id: row.item_id,", "") }],
      ["draft drops item", { ...src, draft: src.draft.replace("item_id: line.item_id ?? null,", "") }],
    ];
    for (const [name, planted] of plants) {
      if (!problems(planted).length) { console.error(`${LABEL} --selftest FAIL — plant "${name}" not caught`); process.exit(1); }
    }
    console.log(`${LABEL} --selftest PASS (real tree clean; ${plants.length}/${plants.length} plants caught)`);
    process.exit(0);
  }
  if (own.length) { console.error(`${LABEL}: FAIL — ${own.join("; ")}`); process.exit(1); }
  console.log(`${LABEL}: OK — an itemized bill line posts to its item's account (poster and preview), never to uncategorized / 9000.`);
}
