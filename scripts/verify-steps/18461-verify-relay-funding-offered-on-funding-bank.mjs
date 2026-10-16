#!/usr/bin/env node
/**
 * LEAD 443.170 — Relay wallet funding is never offered on the funding bank, so categorizing that line credits the bank a
 * second time; and one Relay fill is offered twice (the fill and the expense that adopted its JE).
 *
 * Measured on main 5222ee2cc0: the BofA money-out lines that funded the wallet (PURCHASE … RELAY) had 0 candidates
 * because the relay_deposit branch was gated on the wallet register alone. The deposit's posted JE already credits the
 * funding bank (Dr 1295 + Dr fee / Cr 1000).
 *
 * Guards (match.service.ts — the one matcher):
 *   a. a money-out relay_deposit branch exists that is NOT gated on onRelayWallet;
 *   b. its eligibility reads the deposit's posted JE CREDIT leg on THIS register's ledger account;
 *   c. "already matched" is per bank account (candidates both sides + the storeMatch write point);
 *   d. one candidate per Relay fill: a fill whose fuel_event JE an expense adopted is not offered beside it;
 *   e. money IN stays wallet-only (443.155 DEFECT 1).
 *
 * --selftest: plants each regression and asserts the guard fails.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SERVICE = "apps/backend/src/accounting/bank-recon/match.service.ts";
const MATH = "apps/backend/src/accounting/bank-recon/relay-deposit-match-math.ts";
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");

export function check(src = {}) {
  const service = src.service ?? read(SERVICE);
  const math = src.math ?? read(MATH);
  const findings = [];
  const outStart = service.indexOf("if (!isCredit) {");
  const outSection = outStart === -1 ? "" : service.slice(outStart);
  const funding = outSection.match(/if \(ledgerId && wants\("relay_deposit"\)\) \{[\s\S]*?\n {4}\}\n/)?.[0] ?? "";
  if (!funding) findings.push(`${SERVICE}: no money-out relay_deposit branch on the funding bank (a: offered on the wallet only)`);
  else {
    if (/onRelayWallet/.test(funding)) findings.push(`${SERVICE}: the funding branch is gated on the wallet register (a)`);
    if (!/\$\{RELAY_DEPOSIT_CREDITS_LEDGER_SQL\}/.test(funding) || !/_bankAccountId, ledgerId\]/.test(funding))
      findings.push(`${SERVICE}: funding eligibility does not read the JE credit leg on this register's ledger (b)`);
    if (!/\$\{RELAY_DEPOSIT_FREE_ON_THIS_ACCOUNT_SQL\}/.test(funding)) findings.push(`${SERVICE}: funding branch consumed-check is not per bank account (c)`);
  }
  const creditsLedger = math.match(/export const RELAY_DEPOSIT_CREDITS_LEDGER_SQL = `[\s\S]*?`;/)?.[0] ?? "";
  if (!/journal_entry_uuid = rd\.posted_journal_entry_id/.test(creditsLedger) || !/account_id = \$8::uuid/.test(creditsLedger) || !/debit_or_credit = 'credit'/.test(creditsLedger))
    findings.push(`${MATH}: RELAY_DEPOSIT_CREDITS_LEDGER_SQL is not the posted JE's credit on the register ledger (b)`);
  const free = math.match(/export const RELAY_DEPOSIT_FREE_ON_THIS_ACCOUNT_SQL = `[\s\S]*?`;/)?.[0] ?? "";
  if (!/cbt\.bank_account_id = \$7::uuid/.test(free) || !/pbt\.bank_account_id = \$7::uuid/.test(free))
    findings.push(`${MATH}: RELAY_DEPOSIT_FREE_ON_THIS_ACCOUNT_SQL does not scope the consumed check to this account (c)`);
  const wallet = service.match(/if \(onRelayWallet && wants\("relay_deposit"\)\) \{[\s\S]*?\n {4}\}\n/)?.[0] ?? "";
  if (!wallet) findings.push(`${SERVICE}: the wallet money-in relay_deposit branch is missing or no longer wallet-only (e)`);
  else {
    if (/rd\.matched_bank_transaction_id IS NULL\n/.test(wallet)) findings.push(`${SERVICE}: the wallet side is blocked by the funding side's link (c)`);
    if (outStart !== -1 && service.indexOf(wallet) > outStart) findings.push(`${SERVICE}: the wallet relay_deposit branch moved into money out (e)`);
  }
  const store = service.match(/async function storeMatch\([\s\S]*?\n}\n/)?.[0] ?? "";
  if (!/\$2::text <> 'relay_deposit' OR EXISTS[\s\S]{0,300}held_bt\.bank_account_id = this_bt\.bank_account_id/.test(store))
    findings.push(`${SERVICE}: storeMatch refuses the second side of a Relay deposit (c: one live match per bank account)`);
  const fills = service.match(/if \(onRelayWallet && wants\("relay_fuel"\)\) \{[\s\S]*?\n {4}\}\n/)?.[0] ?? "";
  if (!/jp\.source_transaction_type = 'fuel_event' AND jp\.source_transaction_id = r\.id::text/.test(fills))
    findings.push(`${SERVICE}: a Relay fill is offered beside the expense that adopted its JE (d: one fill = one candidate)`);
  return findings;
}

if (process.argv.includes("--selftest")) {
  const service = read(SERVICE);
  const math = read(MATH);
  const plants = [
    ["funding gated on wallet", { service: service.replace('if (ledgerId && wants("relay_deposit"))', 'if (onRelayWallet && ledgerId && wants("relay_deposit"))') }],
    ["funding branch removed", { service: service.replace('if (ledgerId && wants("relay_deposit"))', 'if (false && wants("relay_deposit"))') }],
    ["no JE credit check", { service: service.replace("AND ${RELAY_DEPOSIT_CREDITS_LEDGER_SQL}", "") }],
    ["debit leg", { math: math.replace("fjp.debit_or_credit = 'credit'", "fjp.debit_or_credit = 'debit'") }],
    ["any account", { math: math.replace("fjp.account_id = $8::uuid", "true") }],
    ["consumed company-wide", { math: math.replace("AND cbt.bank_account_id = $7::uuid", "") }],
    ["storeMatch one side only", { service: service.replace("$2::text <> 'relay_deposit' OR EXISTS", "true OR EXISTS") }],
    ["duplicate fill", { service: service.replace("jp.source_transaction_type = 'fuel_event' AND jp.source_transaction_id = r.id::text", "false") }],
    ["wallet branch gone", { service: service.replace('if (onRelayWallet && wants("relay_deposit"))', 'if (wants("relay_deposit"))') }],
  ];
  if (check().length) {
    console.error("SELFTEST FAIL: baseline not clean", check());
    process.exit(1);
  }
  for (const [name, src] of plants) {
    const same = (src.service ?? service) === service && (src.math ?? math) === math;
    if (same || check(src).length === 0) {
      console.error(`SELFTEST FAIL: plant "${name}" ${same ? "did not apply" : "was not caught"}`);
      process.exit(1);
    }
  }
  console.log(`SELFTEST PASS: ${plants.length} plants caught`);
  process.exit(0);
}

const findings = check();
if (findings.length) {
  console.error(`verify-relay-funding-offered-on-funding-bank FAIL (${findings.length}):`);
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}
console.log("verify-relay-funding-offered-on-funding-bank PASS: Relay funding offered on its funding bank by JE credit leg, per side; one candidate per fill");
