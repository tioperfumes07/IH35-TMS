#!/usr/bin/env node
/**
 * ACCT-F11127 (Lead ruling 2026-11-09) — a Relay SERVICE code (lumper / CAT scales) is an expense on its load paid from the
 * Relay wallet (1295), posted by the ONE Relay fill poster on the service's own item, and wired into the Relay ingest.
 *
 * Measured on prod 2026-11-10: 7 USMCA codes never posted ($341.50 + $14.00 fees = $355.50) — the poster refused them
 * "no fuel product line (e.g. a scale ticket)".
 *
 * Static (no DB):
 *   - fuel-item-account.ts maps lumper -> "Warehouse Lumper Expense" and scales -> "OTR-Scale Expense";
 *   - poster.service.ts FUEL_CATEGORY_CODES carries lumper + scales and resolves a service kind by its item name;
 *   - bank-match-fuel-post.service.ts classifies with relayServiceKindOf BEFORE the unknown-product refusal, and a service
 *     code posts no IFTA gallons;
 *   - relay-fuel-ingest.cron.ts queues listUnpostedRelayServiceCodeCandidates BEFORE flushFuelGlPostsAfterCommit;
 *   - fuel-expense-document.service.ts never writes a fuel record for a service code.
 * --selftest plants each defect.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-relay-service-codes-post";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = {
  item: "apps/backend/src/accounting/fuel-posting/fuel-item-account.ts",
  poster: "apps/backend/src/accounting/fuel-posting/poster.service.ts",
  match: "apps/backend/src/accounting/bank-recon/bank-match-fuel-post.service.ts",
  cron: "apps/backend/src/integrations/relay-payments/relay-fuel-ingest.cron.ts",
  doc: "apps/backend/src/fuel/fuel-expense-document.service.ts",
};
const strip = (s) => String(s ?? "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

export function evaluate(src) {
  const p = [];
  const item = strip(src.item);
  if (!/lumper:\s*"Warehouse Lumper Expense"/.test(item)) p.push("lumper is not mapped to the 'Warehouse Lumper Expense' item");
  if (!/scales:\s*"OTR-Scale Expense"/.test(item)) p.push("scales is not mapped to the 'OTR-Scale Expense' item");
  const poster = strip(src.poster);
  if (!/FUEL_CATEGORY_CODES\s*=\s*\[[^\]]*"lumper"[^\]]*"scales"[^\]]*\]/.test(poster)) p.push("FUEL_CATEGORY_CODES lacks lumper / scales");
  if (!/NON_FUEL_COST_ITEM_NAME\[kind\][\s\S]{0,200}resolveItemByName/.test(poster)) p.push("the poster does not resolve a service kind by its item name");
  const m = strip(src.match);
  const svc = m.indexOf("relayServiceKindOf(");
  const unk = m.indexOf("\"relay_fill_unknown_product\"", m.indexOf("RELAY_KIND"));
  if (svc < 0 || unk < 0 || svc > unk) p.push("bank-match poster does not classify the service code before the unknown-product refusal");
  if (!/ifta_gallons:\s*serviceKind\s*\?\s*null/.test(m)) p.push("a service code still posts IFTA gallons");
  const cron = strip(src.cron);
  const q = cron.indexOf("listUnpostedRelayServiceCodeCandidates(");
  const flush = cron.indexOf("await flushFuelGlPostsAfterCommit(pendingGlPosts", q < 0 ? 0 : q);
  if (q < 0 || flush < 0) p.push("the Relay ingest tick does not queue unposted service codes before the post flush");
  const doc = strip(src.doc);
  if (!/AND NOT \$\{relayServiceCodeSql\("r"\)\}/.test(doc)) p.push("the fill-record writer can still write a fuel record for a service code");
  if (!/!fills\.rows\.length && !relayRow\.rows\[0\]\?\.is_service/.test(doc)) p.push("document adoption still records a fuel row for a service code");
  return p;
}

const read = () => Object.fromEntries(Object.entries(F).map(([k, f]) => [k, readFileSync(path.join(ROOT, f), "utf8")]));

function selftest() {
  const s = read();
  const w = (k, a, b) => ({ ...s, [k]: s[k].replace(a, b) });
  const cases = [
    ["the real sources pass", s, 0],
    ["planted: lumper item removed", w("item", 'lumper: "Warehouse Lumper Expense"', 'lumper: "Fuel"'), 1],
    ["planted: scales dropped from FUEL_CATEGORY_CODES", w("poster", '"lumper", "scales"]', '"lumper"]'), 1],
    ["planted: service classifier removed from the bank-match poster", w("match", "relayServiceKindOf({", "nullKind({"), 1],
    ["planted: service code keeps IFTA gallons", w("match", "ifta_gallons: serviceKind ? null", "ifta_gallons: false ? null"), 1],
    ["planted: ingest tick no longer queues service codes", w("cron", "listUnpostedRelayServiceCodeCandidates(client", "listNothing(client"), 1],
    ["planted: fill-record writer writes service codes", w("doc", 'AND NOT ${relayServiceCodeSql("r")}', ""), 1],
  ];
  let bad = 0;
  for (const [name, src, want] of cases) {
    const got = evaluate(src).length > 0 ? 1 : 0;
    if (got !== want) bad++;
    console.log(`${got === want ? "ok  " : "FAIL"} ${name}`);
  }
  console.log(`${LABEL} --selftest: ${cases.length - bad}/${cases.length}`);
  process.exit(bad ? 1 : 0);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const problems = evaluate(read());
  if (problems.length) { console.error(`${LABEL}: FAIL`); for (const x of problems) console.error(`  - ${x}`); process.exit(1); }
  console.log(`${LABEL}: PASS — Relay lumper / CAT scales codes post on their own items through the one poster, from the ingest`);
}
