#!/usr/bin/env node
/**
 * ROUND 288.2 item 2 — ONE match writer / ONE unmatch writer, and a fuel/recourse match that
 * flips review_state='matched' WITHOUT writing a journal entry in the same transaction is the
 * defect class.
 *
 * Survivor match accept: acceptMatchWithResolveDifference (match.service.ts)
 *   via acceptReconMatch proxies only.
 * Survivor unmatch: unmatchBankTransaction (recon-worklist.service.ts) + unmatchBankTransactionById
 *   (void.service.ts for void cascades — not a second human unmatch UI path).
 *
 * DELETED silent writers (must stay gone):
 *   - banking/reconciliation.routes.ts inline session /unmatch UPDATE (now proxies unmatchBankTransaction)
 *   - link-suggestions / obligation-reconcile / recon /match stamping matched_* themselves (#23994)
 *
 * Fails if:
 *   1. a second accept route still stamps matched_*_id = $N or review_state='matched' itself;
 *   2. match.service fuel/relay path lacks postFuelFillOnBankMatch + matched_journal_entry_id stamp;
 *   3. match.service reserve/recourse path lacks postFactoringChargebackEvent with client=,
 *      or lacks Faro reserve posters (postFaroReserve* / chart_of_accounts_roles);
 *   4. a human unmatch route clears matches without calling unmatchBankTransaction;
 *   5. reconciliation.routes session unmatch still has an inline matched_*_id = NULL UPDATE.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-one-bank-match-writer-writes-je";

const MATCH = "apps/backend/src/accounting/bank-recon/match.service.ts";
const FUEL_POST = "apps/backend/src/accounting/bank-recon/bank-match-fuel-post.service.ts";
const UNMATCH = "apps/backend/src/accounting/bank-recon/recon-worklist.service.ts";
const SESSION_RECON = "apps/backend/src/banking/reconciliation.routes.ts";
const PROXY_ROUTES = [
  "apps/backend/src/banking/link-suggestions-actions.routes.ts",
  SESSION_RECON,
  "apps/backend/src/banking/obligation-reconcile.routes.ts",
  "apps/backend/src/accounting/bank-recon/recon-worklist.routes.ts",
  "apps/backend/src/accounting/reconciliation.routes.ts",
];

const BOUND_MATCH_COL = /matched_(?:expense|bill|load|settlement|invoice|fuel_transaction|relay_fuel_transaction|payment|bill_payment|factoring_advance)_id\s*=\s*\$\d+/i;
const REVIEW_MATCHED = /review_state\s*=\s*'matched'/i;
const INLINE_UNMATCH_NULL = /matched_(?:expense|load|bill|settlement|journal_entry)_id\s*=\s*NULL/i;

export function check(files) {
  const problems = [];
  const match = files[MATCH] ?? "";
  if (!/export async function acceptMatchWithResolveDifference/.test(match)) {
    problems.push(`${MATCH}: missing acceptMatchWithResolveDifference (the one match writer)`);
  }
  if (!/postFuelFillOnBankMatch/.test(match)) {
    problems.push(`${MATCH}: fuel/relay accept must call postFuelFillOnBankMatch in the same transaction`);
  }
  if (!/fuelJournalEntryId/.test(match) || !/matched_journal_entry_id/.test(match)) {
    problems.push(`${MATCH}: fuel match must stamp matched_journal_entry_id with the fuel JE`);
  }
  if (
    !/postFactoringChargebackEvent\(\{[\s\S]*?client\s*,/.test(match) &&
    !/postFactoringChargebackEvent\(\{[\s\S]*?client\s*:/.test(match)
  ) {
    problems.push(`${MATCH}: reserve/recourse match must call postFactoringChargebackEvent with client (same txn)`);
  }
  if (!/isFaroReserveBankAccount|factor_reserve_held|factor_cash_reserve_held/.test(match)) {
    problems.push(`${MATCH}: missing Faro reserve-bank gate (factor_reserve_held / factor_cash_reserve_held)`);
  }
  // OWNER-ORDER §3.1 / CC-2 handoff — never JOIN catalogs.account_role_bindings for reserve roles.
  if (/FROM\s+catalogs\.account_role_bindings[\s\S]{0,200}factor_reserve_held|JOIN\s+catalogs\.account_role_bindings[\s\S]{0,200}factor_reserve_held/i.test(match)) {
    problems.push(`${MATCH}: reserve roles must use accounting.chart_of_accounts_roles, not catalogs.account_role_bindings`);
  }
  if (!/isFaroReserveBankAccount|chart_of_accounts_roles/.test(match)) {
    problems.push(`${MATCH}: must call isFaroReserveBankAccount (chart_of_accounts_roles)`);
  }
  if (!/postFaroReserveRowOnBankMatch|postFaroReserveEntryOnClient/.test(match)) {
    problems.push(`${MATCH}: Faro reserve row match must call postFaroReserveRowOnBankMatch / postFaroReserveEntryOnClient`);
  }
  if (!/postFaroRsvDepositsOnPaymentMatch|faroReserveDepositsOn/.test(match)) {
    problems.push(`${MATCH}: payment match must call postFaroRsvDepositsOnPaymentMatch / faroReserveDepositsOn`);
  }
  const faroHelper = "apps/backend/src/accounting/bank-recon/bank-match-faro-reserve-post.service.ts";
  const faroSrc = files[faroHelper] ?? (fs.existsSync(path.join(ROOT, faroHelper)) ? fs.readFileSync(path.join(ROOT, faroHelper), "utf8") : "");
  if (!faroSrc) {
    problems.push(`${faroHelper}: missing — the bank-match Faro reserve poster`);
  } else {
    if (!/chart_of_accounts_roles/.test(faroSrc)) {
      problems.push(`${faroHelper}: must resolve reserve banks via accounting.chart_of_accounts_roles`);
    }
    if (!/postFaroReserveEntryOnClient/.test(faroSrc)) {
      problems.push(`${faroHelper}: must call postFaroReserveEntryOnClient`);
    }
    if (!/faroReserveDepositsOn/.test(faroSrc)) {
      problems.push(`${faroHelper}: must call faroReserveDepositsOn for payment Rsv Deposit legs`);
    }
  }
  if (!fs.existsSync(path.join(ROOT, FUEL_POST)) && !files[FUEL_POST]) {
    problems.push(`${FUEL_POST}: missing — the bank-match fuel poster`);
  }
  const unmatch = files[UNMATCH] ?? "";
  if (!/export async function unmatchBankTransaction/.test(unmatch)) {
    problems.push(`${UNMATCH}: missing unmatchBankTransaction (the one unmatch writer)`);
  }
  if (!/reverseJournalEntryNoFlip/.test(unmatch)) {
    problems.push(`${UNMATCH}: unmatch must reverse the JE (never flag-flip alone)`);
  }
  // OWNER-ORDER 2026-10-02 §4 — unmatch must clear these three (were half-released).
  for (const col of ["matched_invoice_id", "matched_advance_id", "categorization_gl_account_id"]) {
    if (!new RegExp(`${col}\\s*=\\s*NULL`, "i").test(unmatch)) {
      problems.push(`${UNMATCH}: unmatch must clear ${col} (OWNER-ORDER §4 half-release)`);
    }
  }
  // Reverse only match-created JEs (fuel/relay/factoring), never a JE that was merely the match target.
  if (!/prev_fuel_transaction_id|matched_fuel_transaction_id/.test(unmatch)) {
    problems.push(`${UNMATCH}: unmatch must snapshot fuel match ids before deciding JE reverse`);
  }
  if (!/matchCreatedJe/.test(unmatch)) {
    problems.push(`${UNMATCH}: unmatch must gate JE reverse on matchCreatedJe (fuel/relay/factoring only)`);
  }

  const session = files[SESSION_RECON] ?? "";
  if (session) {
    if (!/unmatchBankTransaction/.test(session)) {
      problems.push(`${SESSION_RECON}: session /unmatch must call unmatchBankTransaction`);
    }
    if (INLINE_UNMATCH_NULL.test(session)) {
      problems.push(`${SESSION_RECON}: deleted silent unmatch writer still nulls matched_*_id inline`);
    }
  }

  for (const rel of PROXY_ROUTES) {
    const src = files[rel] ?? "";
    if (!src) continue;
    if (BOUND_MATCH_COL.test(src) && !/acceptReconMatch|acceptMatchWithResolveDifference/.test(src)) {
      problems.push(`${rel}: stamps matched_*_id without calling the one match writer`);
    }
    if (REVIEW_MATCHED.test(src) && !/acceptReconMatch|acceptMatchWithResolveDifference/.test(src)) {
      problems.push(`${rel}: sets review_state='matched' without the one match writer`);
    }
    if (/\/unmatch|"unmatch"/.test(src) && /registerBank|app\.(post|delete)/.test(src)) {
      if (
        !/unmatchBankTransaction/.test(src) &&
        (rel.includes("recon-worklist.routes") || rel.includes("reconciliation.routes"))
      ) {
        problems.push(`${rel}: unmatch route must call unmatchBankTransaction`);
      }
    }
  }
  return problems;
}

function load() {
  const out = {};
  for (const rel of [MATCH, FUEL_POST, UNMATCH, ...PROXY_ROUTES]) {
    const p = path.join(ROOT, rel);
    if (fs.existsSync(p)) out[rel] = fs.readFileSync(p, "utf8");
  }
  return out;
}

if (process.argv.includes("--selftest")) {
  const real = load();
  if (check(real).length) {
    console.error(`${LABEL} --selftest FAIL: real tree: ${check(real)[0]}`);
    process.exit(1);
  }
  const noFuel = { ...real, [MATCH]: real[MATCH].replace(/postFuelFillOnBankMatch/g, "NOT_THE_HOOK") };
  if (!check(noFuel).length) {
    console.error(`${LABEL} --selftest FAIL: missing fuel hook not caught`);
    process.exit(1);
  }
  const silentUnmatch = {
    ...real,
    [SESSION_RECON]:
      (real[SESSION_RECON] ?? "").replace(/unmatchBankTransaction/g, "NOT_THE_WRITER") +
      "\nmatched_expense_id = NULL\n",
  };
  if (!check(silentUnmatch).length) {
    console.error(`${LABEL} --selftest FAIL: silent session unmatch not caught`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const problems = check(load());
if (problems.length) {
  console.error(`${LABEL}: FAIL —\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(
  `${LABEL}: PASS — survivor match=acceptMatchWithResolveDifference; survivor unmatch=unmatchBankTransaction; fuel+recourse post JE same txn`
);
