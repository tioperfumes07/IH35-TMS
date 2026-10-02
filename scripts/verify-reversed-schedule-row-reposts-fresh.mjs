#!/usr/bin/env node
// ROUND 300 (CC-1, proven on a Neon fork) — re-posting a reversed prepaid-amortization / depreciation / prepaid
// purchase books a FRESH JE under the next attempt key (<base>:r1 …). findExistingPostedJe found the reversed JE by its
// base key, re-linked the row to it, reported "posted" and booked nothing (the row was then stuck:
// nothing_to_reverse). Fails if any of the three post sites stops resolving its key through resolvePostingAttempt, or
// if resolvePostingAttempt stops treating reversed / voided JEs as dead.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-reversed-schedule-row-reposts-fresh";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/backend/src/accounting/amortization-posting/amortization-posting.service.ts";
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

export function problems(src) {
  const c = strip(src);
  const p = [];
  for (const builder of ["buildPrepaidPurchaseIdempotencyKey", "buildPrepaidAmortizationIdempotencyKey", "buildDepreciationIdempotencyKey"]) {
    if (!new RegExp(`resolvePostingAttempt\\(client, [a-zA-Z.]+, ${builder}\\(`).test(c)) p.push(`${FILE}: the ${builder} post site must resolve its key through resolvePostingAttempt`);
  }
  if (/findExistingPostedJe\(client/.test(c.slice(c.indexOf("export async function postPrepaidPurchase")))) p.push(`${FILE}: a post site still calls findExistingPostedJe (re-links a reversed JE)`);
  if (!/j\.reversed_by_je_id IS NOT NULL OR j\.status = 'voided'/.test(c)) p.push(`${FILE}: resolvePostingAttempt must treat reversed / voided JEs as dead`);
  return p;
}

export function run() { return problems(readFileSync(path.join(ROOT, FILE), "utf8")); }

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const src = readFileSync(path.join(ROOT, FILE), "utf8");
  const own = problems(src);
  if (process.argv.includes("--selftest")) {
    if (own.length) { console.error(`${LABEL} --selftest FAIL on the real tree — ${own.join("; ")}`); process.exit(1); }
    if (!problems(src.replace("j.reversed_by_je_id IS NOT NULL OR j.status = 'voided'", "false")).length) { console.error(`${LABEL} --selftest FAIL — dead-JE test removal not caught`); process.exit(1); }
    if (!problems(src.replace("resolvePostingAttempt(client, booksCompanyId, buildDepreciationIdempotencyKey(", "foo(client, booksCompanyId, buildDepreciationIdempotencyKey(")).length) { console.error(`${LABEL} --selftest FAIL — depreciation site not caught`); process.exit(1); }
    console.log(`${LABEL} --selftest PASS (real tree clean; 2/2 plants caught)`);
    process.exit(0);
  }
  if (own.length) { console.error(`${LABEL}: FAIL —\n  ${own.join("\n  ")}`); process.exit(1); }
  console.log(`${LABEL}: OK — a reversed schedule row re-posts a fresh JE under the next attempt key.`);
}
