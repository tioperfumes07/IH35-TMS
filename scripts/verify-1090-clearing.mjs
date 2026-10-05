#!/usr/bin/env node
// ROUND 326 queue item 12 (G-06, CC-1) — 1090 UNDEPOSITED FUNDS. Receipts accumulated in 1090 because:
//   (a) a batch wire matched to several receipts (acceptExactMultiDocumentMatch) cleared the bank line but posted NO
//       sweep, and only the first advance got the bank pointer the sweep looks up;
//   (b) a missing bank ledger account / clearing mapping was a silent "skip" on the 1:1 sweep;
//   (c) a customer payment with no deposit account picked defaulted to 1090 (owner: default operating bank).
// This guard fails if any of those comes back.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-1090-clearing";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = {
  match: "apps/backend/src/accounting/bank-recon/match.service.ts",
  engine: "apps/backend/src/accounting/posting-engine.service.ts",
  custPay: "apps/backend/src/accounting/customer-payments.routes.ts",
  pay: "apps/backend/src/accounting/payments.routes.ts",
};
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

export function problems(src) {
  const p = [];
  const match = strip(src.match);
  const mm = match.slice(match.indexOf("export async function acceptExactMultiDocumentMatch"));
  const mmBody = mm.slice(0, mm.indexOf("\nexport async function", 10) > 0 ? mm.indexOf("\nexport async function", 10) : mm.length);
  if (!/runPaymentAcceptFollowUps\(/.test(mmBody)
    || !/runFactoringAdvanceAcceptFollowUps\(/.test(mmBody)) {
    p.push("acceptExactMultiDocumentMatch must sweep EVERY payment (via runPaymentAcceptFollowUps) and factoring-advance entry (via runFactoringAdvanceAcceptFollowUps) out of 1090");
  }
  if (!/async function runPaymentAcceptFollowUps/.test(match)
    || !/sweepMatchedReceiptToBank\(\s*client,\s*args\.operatingCompanyId,\s*"customer_payment_deposit",\s*args\.paymentId/.test(match)) {
    p.push("runPaymentAcceptFollowUps must sweep customer_payment_deposit so 1:1 and multi cannot drift");
  }
  if (!/async function runFactoringAdvanceAcceptFollowUps/.test(match)
    || !/sweepMatchedReceiptToBank\(\s*client,\s*args\.operatingCompanyId,\s*"factoring_advance_deposit",\s*args\.factoringAdvanceId/.test(match)
    || !/postFactoringChargebackEvent\(\{[\s\S]*?client\s*,/.test(match)) {
    p.push("runFactoringAdvanceAcceptFollowUps must sweep factoring_advance_deposit on operating wires and chargeback reserve-bank repurchase so 1:1 and multi cannot drift");
  }
  const skip = match.match(/DEPOSIT_SWEEP_SKIPPABLE = \[([^\]]*)\]/);
  if (!skip) p.push("the shared DEPOSIT_SWEEP_SKIPPABLE list is missing");
  else if (/BANK_LEDGER_ACCOUNT_MISSING|ACCOUNT_MAPPING_MISSING/.test(skip[1])) p.push("a missing bank ledger account / clearing mapping must refuse the match, never skip the sweep");
  if (/skippable: string\[\] = \[/.test(match)) p.push("a private sweep skip list is back (use DEPOSIT_SWEEP_SKIPPABLE)");
  const engine = strip(src.engine);
  if (!/rm\.ledger_entry_kind = 'factoring_advance'[\s\S]{0,120}rm\.ledger_entry_id::text = \$1::text/.test(engine)) p.push("the factoring-advance sweep must find its bank line by its own reconciliation match row (multi-match)");
  for (const [k, label] of [["custPay", "customer-payments.routes.ts"], ["pay", "payments.routes.ts"]]) {
    const s = strip(src[k]);
    if (/resolveRoleAccountOptional\(client, query\.data\.operating_company_id, "undeposited_funds"\)/.test(s)) p.push(`${label}: a payment with no deposit account must land on the operating bank, not 1090`);
    if (!/"operating_bank"\);\s*\n\s*if \(!depositedToAccountId\) return \{ code: 400 as const, error: "operating_bank_unmapped" \}/.test(s)) p.push(`${label}: default deposit account must be the operating_bank role, refused by name when unbound`);
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
      ["multi-match factoring helper gone", { ...src, match: src.match.replaceAll("await runFactoringAdvanceAcceptFollowUps(client, {", "await missingFactoringFollowUps(client, {") }],
      ["multi-match payment helper gone", { ...src, match: src.match.replaceAll("await runPaymentAcceptFollowUps(client, {", "await missingPaymentFollowUps(client, {") }],
      ["config error skipped", { ...src, match: src.match.replace('"QBO_CUSTOMER_PAYMENT_POST_GL_REFUSED"] as const', '"QBO_CUSTOMER_PAYMENT_POST_GL_REFUSED", "ACCOUNT_MAPPING_MISSING"] as const') }],
      ["single-pointer lookup", { ...src, engine: src.engine.replace("rm.ledger_entry_kind = 'factoring_advance'", "rm.ledger_entry_kind = 'x'") }],
      ["1090 default back", { ...src, custPay: src.custPay.replace('"operating_bank");', '"undeposited_funds");') }],
    ];
    for (const [name, planted] of plants) {
      if (!problems(planted).length) { console.error(`${LABEL} --selftest FAIL — plant "${name}" not caught`); process.exit(1); }
    }
    console.log(`${LABEL} --selftest PASS (real tree clean; ${plants.length}/${plants.length} plants caught)`);
    process.exit(0);
  }
  if (own.length) { console.error(`${LABEL}: FAIL — ${own.join("; ")}`); process.exit(1); }
  console.log(`${LABEL}: OK — every matched receipt (1:1 and multi-match) sweeps out of 1090, config gaps refuse, payments default to the operating bank.`);
}
