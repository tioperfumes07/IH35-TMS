#!/usr/bin/env node
/**
 * ACCT-F5676 — the settlement-dispute DISBURSEMENT flow must follow the LOCKED design (owner
 * 2026-08-20): `settlement_dispute_correction_recovery` is a LIABILITY / net-pay clearing (escrow
 * class, locked §9.4). Approval credits it; disbursement DEBITS the clearing and credits the
 * payment method's cash account when cash leaves — never a second driver_pay_expense debit (that
 * double-books the expense invisibly to any debits==credits assertion).
 *
 * Locked here (settlement-dispute.service.ts + settlement-dispute.routes.ts):
 *   1. disburseSettlementDisputeCorrection exists and debits the CLEARING role
 *      (settlement_dispute_correction_recovery), not driver_pay_expense;
 *   2. the function contains NO driver_pay_expense reference (the double-book trap);
 *   3. it refuses when the approval JE never posted (approval_je_missing — nothing sits on the
 *      clearing to draw down);
 *   4. idempotent: a live linked disbursement JE (transaction_source_links
 *      'dispute_disbursement', posted, unreversed) is returned, never duplicated;
 *   5. the cash side comes from catalogs.payment_methods.gl_account_id, entity-scoped;
 *   6. the /disburse route is mounted and rate-limited.
 *
 * Run:  node scripts/verify-settlement-dispute-disbursement-clearing.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-dispute-disbursement-clearing";
const SVC = "apps/backend/src/driver-finance/settlement-dispute.service.ts";
const ROUTES = "apps/backend/src/driver-finance/settlement-dispute.routes.ts";

export function analyze(files) {
  const failures = [];
  const svc = files[SVC].replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/^\s*--.*$/gm, "");
  const routes = files[ROUTES].replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  const fnMatch = /export async function disburseSettlementDisputeCorrection[\s\S]*?\n\}\n/.exec(svc);
  if (!fnMatch) {
    failures.push(`${SVC}: disburseSettlementDisputeCorrection is missing — an approved dispute correction has no cash path (SETTLEMENT-DISPUTE-APPROVAL-HAS-NO-DISBURSEMENT-PATH).`);
    return failures;
  }
  const fn = fnMatch[0];
  if (!/"settlement_dispute_correction_recovery"/.test(fn) || !/account_id: clearingAccountId,\s*\n\s*debit_or_credit: "debit"/.test(fn)) {
    failures.push(`${SVC}: disbursement must DEBIT the settlement_dispute_correction_recovery clearing (the liability approval credited) — locked design.`);
  }
  if (/driver_pay_expense/.test(fn)) {
    failures.push(`${SVC}: the disbursement must NEVER touch driver_pay_expense — approval already debited it once; a second debit double-books the expense.`);
  }
  if (!/approval_je_missing/.test(fn)) {
    failures.push(`${SVC}: disbursement must refuse when the approval JE never posted — nothing sits on the clearing account to draw down.`);
  }
  if (!/'dispute_disbursement'[\s\S]{0,400}?je\.reversed_by_je_id IS NULL/.test(fn) || !/already_disbursed: true/.test(fn)) {
    failures.push(`${SVC}: disbursement must be idempotent — return the live linked JE (transaction_source_links 'dispute_disbursement', posted, unreversed), never post a second one.`);
  }
  if (!/catalogs\.payment_methods[\s\S]{0,120}?operating_company_id = \$2::uuid/.test(fn)) {
    failures.push(`${SVC}: the cash account must resolve from catalogs.payment_methods.gl_account_id, entity-scoped.`);
  }
  if (!/settlement-disputes\/:id\/disburse", \{ config: \{ rateLimit:/.test(routes)) {
    failures.push(`${ROUTES}: the /disburse route must be mounted and rate-limited.`);
  }
  return failures;
}

function readAll() {
  const files = {};
  for (const f of [SVC, ROUTES]) files[f] = fs.readFileSync(path.join(ROOT, f), "utf8");
  return files;
}

if (process.argv.includes("--selftest")) {
  const real = readAll();
  const good = analyze(real);
  if (good.length) throw new Error(`[${LABEL}] selftest: the REAL files should PASS but failed: ${good.join("; ")}`);

  const m1 = { ...real, [SVC]: real[SVC].replace(/export async function disburseSettlementDisputeCorrection/, "async function disburseSettlementDisputeCorrection_gone") };
  if (!analyze(m1).some((f) => f.includes("is missing"))) throw new Error(`[${LABEL}] selftest: removed function should FAIL but passed`);

  const m2 = {
    ...real,
    [SVC]: real[SVC].replace(
      '"settlement_dispute_correction_recovery"\n    );\n    if (!clearingAccountId) return { ok: false as const, code: 409, error: "E_CORRECTIVE_JE_ACCOUNTS_MISSING" };',
      '"driver_pay_expense"\n    );\n    if (!clearingAccountId) return { ok: false as const, code: 409, error: "E_CORRECTIVE_JE_ACCOUNTS_MISSING" };'
    ),
  };
  if (!analyze(m2).some((f) => f.includes("NEVER touch driver_pay_expense") || f.includes("DEBIT the settlement_dispute_correction_recovery"))) {
    throw new Error(`[${LABEL}] selftest: driver_pay_expense mutation should FAIL but passed`);
  }

  const m3 = { ...real, [SVC]: real[SVC].replace(/if \(existingId\) return \{ ok: true as const, posted: true as const, journal_entry_id: existingId, already_disbursed: true \};/, "") };
  if (!analyze(m3).some((f) => f.includes("idempotent"))) throw new Error(`[${LABEL}] selftest: removed idempotent return should FAIL but passed`);

  console.log(`[${LABEL}] selftest: PASS — real green; removed-function, expense-debit and removed-idempotency mutations all red`);
  process.exit(0);
}

const failures = analyze(readAll());
if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — disbursement draws down the clearing (never driver_pay_expense), idempotently, from an entity-scoped payment method, via a mounted rate-limited route`);
