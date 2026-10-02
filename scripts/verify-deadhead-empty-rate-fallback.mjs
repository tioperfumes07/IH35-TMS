#!/usr/bin/env node
// ROUND 326 queue item 7 (G-10, CC-1) — DEADHEAD PAY. Signed PDFs print Empty Miles dollars on loads where the
// engine wrote $0.00. Owner MILES SPEC: the empty rate is its own value when set, otherwise the loaded per-mile
// rate. This guard fails if:
//   1. the Settlement Creator computes empty pay anywhere but creatorEmptyPayCents / creatorEmptyRateCents, or
//      multiplies empty_miles by empty_rate_cents directly again (the $0 path);
//   2. creatorEmptyRateCents stops falling back to the loaded rate (line_haul_rate_cents);
//   3. book-load stops falling back to the card's loaded rate, or stops recording real empty miles that have no
//      rate (driver_bill.deadhead_unpriced_no_empty_rate) — a silent $0.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-deadhead-empty-rate-fallback";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = {
  creator: "apps/backend/src/driver-finance/settlement-creator.service.ts",
  pay: "apps/backend/src/driver-finance/settlement-creator-empty-pay.ts",
  book: "apps/backend/src/dispatch/book-load.service.ts",
};
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

export function problems(src) {
  const p = [];
  const creator = strip(src.creator);
  if (/empty_miles[^;\n]{0,80}\*[^;\n]{0,80}empty_rate_cents|empty_rate_cents[^;\n]{0,80}\*[^;\n]{0,80}empty_miles/.test(creator)) p.push("the creator multiplies empty miles by the typed empty rate directly (the $0.00 path)");
  if ((creator.match(/creatorEmptyPayCents\(load\)/g) ?? []).length < 2) p.push("the creator's preview AND commit must both compute empty pay through creatorEmptyPayCents(load)");
  if (!/creatorEmptyRateCents\(load\)/.test(creator)) p.push("the creator's Empty Miles line must use creatorEmptyRateCents(load)");
  const pay = strip(src.pay);
  if (!/const loaded = Number\(load\.line_haul_rate_cents/.test(pay) || !/own > 0\) return own/.test(pay)) p.push("creatorEmptyRateCents must use the typed empty rate, else fall back to the loaded per-mile rate");
  const book = strip(src.book);
  if (!/rate_empty_per_mile_cents\) > 0[\s\S]{0,120}: Number\(rate\?\.rate_per_mile_cents \?\? 0\)/.test(book)) p.push("book-load must fall back to the card's loaded rate when no empty rate is configured");
  if (!/driver_bill\.deadhead_unpriced_no_empty_rate/.test(book)) p.push("book-load must record real empty miles that have no rate (deadhead_unpriced_no_empty_rate), never a silent $0");
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
      ["direct multiply back", { ...src, creator: src.creator.replace("const empty = creatorEmptyPayCents(load);", "const empty = Math.round(Number(load.empty_miles || 0) * Number(load.empty_rate_cents || 0));") }],
      ["no loaded fallback", { ...src, pay: src.pay.replace("const loaded = Number(load.line_haul_rate_cents ?? 0);", "const loaded = 0;") }],
      ["silent $0 in book-load", { ...src, book: src.book.replace("driver_bill.deadhead_unpriced_no_empty_rate", "x") }],
    ];
    for (const [name, planted] of plants) {
      if (!problems(planted).length) { console.error(`${LABEL} --selftest FAIL — plant "${name}" not caught`); process.exit(1); }
    }
    console.log(`${LABEL} --selftest PASS (real tree clean; ${plants.length}/${plants.length} plants caught)`);
    process.exit(0);
  }
  if (own.length) { console.error(`${LABEL}: FAIL — ${own.join("; ")}`); process.exit(1); }
  console.log(`${LABEL}: OK — empty miles pay at the empty rate, else the loaded per-mile rate; a rate-less deadhead is recorded, never a silent $0.`);
}
