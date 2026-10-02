#!/usr/bin/env node
// ROUND 326 queue item 13 (G-07, CC-1) — THE 2510 DREAMLINE PAYABLE PAYMENT SIDE. A bank line categorized to an
// account that is another bank account's ledger account (the Dreamline card's 2510) must become a bank-to-bank
// transfer through the existing transfer engine (one transfer, one JE, the card's counterpart line paired), never an
// expense-style categorization that posts one side and lets the card's own line post again. Fails if:
//   1. the categorize route stops resolving that target (resolveBankAccountTransferTarget) BEFORE it categorizes, or
//      stops handing it to markBankFeedLineAsTransfer;
//   2. the resolver stops excluding the line's own bank account, or guesses a pair among several candidates.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-card-payment-side";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = {
  route: "apps/backend/src/banking/categorization.routes.ts",
  resolver: "apps/backend/src/banking/bank-account-transfer-routing.ts",
};
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

export function problems(src) {
  const p = [];
  const route = strip(src.route);
  const cat = route.slice(route.indexOf('"/api/v1/banking/transactions/:id/categorize"'));
  const resolveAt = cat.indexOf("resolveBankAccountTransferTarget(");
  const categorizeAt = cat.indexOf("categorization_gl_account_id");
  if (resolveAt < 0) p.push("the categorize route must resolve a bank-account ledger target (resolveBankAccountTransferTarget)");
  else if (categorizeAt >= 0 && resolveAt > categorizeAt) p.push("the transfer target must be resolved BEFORE the line is categorized");
  if (!/if \(target\) \{[\s\S]{0,200}markBankFeedLineAsTransfer\(\{/.test(cat)) p.push("a bank-account target must go through markBankFeedLineAsTransfer (the existing transfer engine)");
  const r = strip(src.resolver);
  if (!/AND id <> \$3::uuid/.test(r)) p.push("the resolver must exclude the line's own bank account");
  if (!/pair\.length === 1 \? pair\[0\]\.id : null/.test(r)) p.push("the resolver must pair only an unambiguous single counterpart line");
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
      ["route ignores card target", { ...src, route: src.route.replace("resolveBankAccountTransferTarget(client as never", "noop(client as never") }],
      ["guessed pair", { ...src, resolver: src.resolver.replace("pair.length === 1 ? pair[0].id : null", "pair[0]?.id ?? null") }],
      ["self account", { ...src, resolver: src.resolver.replace("AND id <> $3::uuid", "AND $3::uuid IS NOT NULL") }],
    ];
    for (const [name, planted] of plants) {
      if (!problems(planted).length) { console.error(`${LABEL} --selftest FAIL — plant "${name}" not caught`); process.exit(1); }
    }
    console.log(`${LABEL} --selftest PASS (real tree clean; ${plants.length}/${plants.length} plants caught)`);
    process.exit(0);
  }
  if (own.length) { console.error(`${LABEL}: FAIL — ${own.join("; ")}`); process.exit(1); }
  console.log(`${LABEL}: OK — a payment categorized to another bank account's ledger (2510) is a transfer through the one transfer engine, paired when unambiguous.`);
}
