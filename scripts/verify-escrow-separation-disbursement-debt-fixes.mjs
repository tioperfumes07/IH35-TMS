#!/usr/bin/env node
/**
 * ACCT-F5657 — three unrelated bugs found in one driver-finance escrow/deduction-cap audit, each
 * fixed with a targeted, dedicated check here (matching this session's established precedent —
 * generalized text-pattern scans have repeatedly produced false positives against structurally
 * different call sites; explicit per-function checks are safer for this fix class):
 *
 * (1) escrow-separation.service.ts's releaseDriverEscrowSeparation paid the accounting-side escrow
 *     account (accounting.escrow_accounts) on a release but never decremented the driver-facing
 *     store (driver_finance.escrow_balances / escrow_ledger) — the exact same "one-way sync" bug
 *     ESC-FORFEIT-SPLIT already fixed once for the forfeit path in the SAME module family. A driver
 *     paid out via separation kept reading a stale (unreduced) driver-facing balance, so a LATER
 *     forfeit's over-draw guard (which reads the driver-facing store) could double-drain the same
 *     escrow dollars.
 *
 * (2) settlement-payrun-close.service.ts's recordSettlementDisbursement bound
 *     [operatingCompanyId, settlementId, ...] against SQL text expecting $1=id (the settlement's own
 *     uuid), $2=operating_company_id — the exact reverse order. A settlement id is never a valid
 *     operating_company_id, so the UPDATE could never match any row: a permanent, silent no-op that
 *     left every pay-run close's disbursement linkage unrecorded.
 *
 * (3) pre-dispatch-validator.service.ts's checkDriverDebt selected a column
 *     (total_debt_cents) that has never existed on driver_finance.recompute_driver_debt(uuid) — the
 *     real column is total_active_debt, in DOLLARS, not cents — so the query has always thrown
 *     42703, silently swallowed by a bare catch{}, meaning the GAP-14-DRIVER-DEBT pre-dispatch
 *     warning has never fired for any driver at any debt level.
 *
 * Run:  node scripts/verify-escrow-separation-disbursement-debt-fixes.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-escrow-separation-disbursement-debt-fixes";

const ESCROW_SEPARATION_FILE = "apps/backend/src/driver-finance/escrow-separation.service.ts";
const SETTLEMENT_PAYRUN_CLOSE_FILE = "apps/backend/src/driver-finance/settlement-payrun-close.service.ts";
const PRE_DISPATCH_FILE = "apps/backend/src/dispatch/validation/pre-dispatch-validator.service.ts";

function strip(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/^\s*--.*$/gm, "");
}

export function analyzeEscrowSeparationSource(src) {
  const failures = [];
  const code = strip(src);
  const fnMatch = code.match(/export async function releaseDriverEscrowSeparation\([\s\S]*?\n\}\n/);
  if (!fnMatch) {
    failures.push(`${ESCROW_SEPARATION_FILE}: could not locate releaseDriverEscrowSeparation`);
    return failures;
  }
  const fn = fnMatch[0];
  if (!fn.includes("releaseEscrowOnClient")) {
    failures.push(`${ESCROW_SEPARATION_FILE}: releaseDriverEscrowSeparation must still call releaseEscrowOnClient — function structure changed, re-check this guard`);
    return failures;
  }
  const afterReleaseIdx = fn.indexOf("releaseEscrowOnClient");
  const tail = fn.slice(afterReleaseIdx);
  if (!/UPDATE driver_finance\.escrow_balances/.test(tail)) {
    failures.push(`${ESCROW_SEPARATION_FILE}: a release must also decrement driver_finance.escrow_balances (ACCT-F5657) — otherwise the driver-facing balance never drops and a later forfeit can double-drain the same escrow.`);
  }
  if (!/INSERT INTO driver_finance\.escrow_ledger/.test(tail)) {
    failures.push(`${ESCROW_SEPARATION_FILE}: a release must also append a driver_finance.escrow_ledger row (ACCT-F5657) — the two stores must reconcile after every release.`);
  }
  return failures;
}

export function analyzeSettlementPayrunCloseSource(src) {
  const failures = [];
  const code = strip(src);
  const fnMatch = code.match(/async function recordSettlementDisbursement\([\s\S]*?\n\}/);
  if (!fnMatch) {
    failures.push(`${SETTLEMENT_PAYRUN_CLOSE_FILE}: could not locate recordSettlementDisbursement`);
    return failures;
  }
  const fn = fnMatch[0];
  if (!/\[\s*args\.settlementId,\s*args\.operatingCompanyId,/.test(fn)) {
    failures.push(
      `${SETTLEMENT_PAYRUN_CLOSE_FILE}: recordSettlementDisbursement's bind array must start ` +
        `[args.settlementId, args.operatingCompanyId, ...] to match its own SQL text ($1=id, ` +
        `$2=operating_company_id) — ACCT-F5657, otherwise the UPDATE matches zero rows every time.`
    );
  }
  return failures;
}

export function analyzePreDispatchSource(src) {
  const failures = [];
  const code = strip(src);
  const fnMatch = code.match(/async function checkDriverDebt\([\s\S]*?\n\}/);
  if (!fnMatch) {
    failures.push(`${PRE_DISPATCH_FILE}: could not locate checkDriverDebt`);
    return failures;
  }
  const fn = fnMatch[0];
  if (/total_debt_cents::bigint\s*\n\s*FROM driver_finance\.recompute_driver_debt/.test(fn) || /SELECT\s+total_debt_cents/.test(fn)) {
    failures.push(`${PRE_DISPATCH_FILE}: checkDriverDebt must not select the non-existent total_debt_cents column from recompute_driver_debt (ACCT-F5657) — the real column is total_active_debt.`);
  }
  if (!/total_active_debt\s*\*\s*100/.test(fn)) {
    failures.push(`${PRE_DISPATCH_FILE}: checkDriverDebt must select total_active_debt and convert dollars to cents (* 100) before comparing to DEBT_WARN_THRESHOLD_CENTS (ACCT-F5657) — otherwise a real debt compares two orders of magnitude too small.`);
  }
  return failures;
}

export function run() {
  const escrowSeparation = fs.readFileSync(path.join(ROOT, ESCROW_SEPARATION_FILE), "utf8");
  const settlementPayrunClose = fs.readFileSync(path.join(ROOT, SETTLEMENT_PAYRUN_CLOSE_FILE), "utf8");
  const preDispatch = fs.readFileSync(path.join(ROOT, PRE_DISPATCH_FILE), "utf8");
  return [
    ...analyzeEscrowSeparationSource(escrowSeparation),
    ...analyzeSettlementPayrunCloseSource(settlementPayrunClose),
    ...analyzePreDispatchSource(preDispatch),
  ];
}

if (process.argv.includes("--selftest")) {
  const GOOD_ESCROW = `
export async function releaseDriverEscrowSeparation(input, actor) {
  return withCurrentUser(actor.userId, async (client) => {
    if (net.net_release_cents > 0) {
      const released = await releaseEscrowOnClient(client, { amount_cents: net.net_release_cents }, actor);
      const dfBal = await client.query(\`
        UPDATE driver_finance.escrow_balances
         SET current_balance_cents = current_balance_cents - $3::bigint
         WHERE current_balance_cents >= $3::bigint
         RETURNING id::text, current_balance_cents::bigint\`);
      const dfRow = dfBal.rows[0];
      if (!dfRow) throw new Error("E_ESCROW_BALANCES_MISSING");
      await client.query(\`INSERT INTO driver_finance.escrow_ledger (transaction_type) VALUES ('release')\`);
    }
  });
}
`;
  const goodEscrowFailures = analyzeEscrowSeparationSource(GOOD_ESCROW);
  if (goodEscrowFailures.length) {
    throw new Error(`[${LABEL}] selftest PASS fixture (escrow-separation) FAILED: ${goodEscrowFailures.join("; ")}`);
  }

  const BAD_ESCROW = `
export async function releaseDriverEscrowSeparation(input, actor) {
  return withCurrentUser(actor.userId, async (client) => {
    if (net.net_release_cents > 0) {
      const released = await releaseEscrowOnClient(client, { amount_cents: net.net_release_cents }, actor);
      releasedPostingId = released.posting.id;
    }
  });
}
`;
  if (analyzeEscrowSeparationSource(BAD_ESCROW).length !== 2) {
    throw new Error(`[${LABEL}] selftest REGRESSION fixture (escrow-separation, no driver-facing sync) should FAIL both checks but didn't`);
  }

  const GOOD_DISBURSEMENT = `
async function recordSettlementDisbursement(client, args) {
  const upd = await client.query(
    \`UPDATE driver_finance.driver_settlements SET payment_method = $3 WHERE id = $1::uuid AND operating_company_id = $2::uuid\`,
    [args.settlementId, args.operatingCompanyId, args.paymentMethodName, args.paymentReference, args.bankTxnId]
  );
  return (upd.rowCount ?? 0) > 0;
}
`;
  const goodDisbursementFailures = analyzeSettlementPayrunCloseSource(GOOD_DISBURSEMENT);
  if (goodDisbursementFailures.length) {
    throw new Error(`[${LABEL}] selftest PASS fixture (settlement-payrun-close) FAILED: ${goodDisbursementFailures.join("; ")}`);
  }

  const BAD_DISBURSEMENT = `
async function recordSettlementDisbursement(client, args) {
  const upd = await client.query(
    \`UPDATE driver_finance.driver_settlements SET payment_method = $3 WHERE id = $1::uuid AND operating_company_id = $2::uuid\`,
    [args.operatingCompanyId, args.settlementId, args.paymentMethodName, args.paymentReference, args.bankTxnId]
  );
  return (upd.rowCount ?? 0) > 0;
}
`;
  if (!analyzeSettlementPayrunCloseSource(BAD_DISBURSEMENT).length) {
    throw new Error(`[${LABEL}] selftest REGRESSION fixture (settlement-payrun-close, swapped bind order) should FAIL but passed`);
  }

  const GOOD_DEBT = `
async function checkDriverDebt(client, driverUuid, operatingCompanyId) {
  try {
    const res = await client.query(
      \`SELECT COALESCE((SELECT ROUND(total_active_debt * 100)::bigint FROM driver_finance.recompute_driver_debt($1::uuid) LIMIT 1), 0) AS debt_cents\`,
      [driverUuid]
    );
  } catch (err) {
    console.warn("[GAP-14-DRIVER-DEBT] failed:", err);
  }
  return [];
}
`;
  const goodDebtFailures = analyzePreDispatchSource(GOOD_DEBT);
  if (goodDebtFailures.length) {
    throw new Error(`[${LABEL}] selftest PASS fixture (pre-dispatch-validator) FAILED: ${goodDebtFailures.join("; ")}`);
  }

  const BAD_DEBT = `
async function checkDriverDebt(client, driverUuid, operatingCompanyId) {
  try {
    const res = await client.query(
      \`SELECT COALESCE((SELECT total_debt_cents::bigint FROM driver_finance.recompute_driver_debt($1::uuid) LIMIT 1), 0) AS debt_cents\`,
      [driverUuid]
    );
  } catch {}
  return [];
}
`;
  const badDebtFailures = analyzePreDispatchSource(BAD_DEBT);
  if (badDebtFailures.length !== 2) {
    throw new Error(`[${LABEL}] selftest REGRESSION fixture (pre-dispatch-validator, wrong column + no cents conversion) should FAIL both checks but got ${badDebtFailures.length}`);
  }

  console.log(`[${LABEL}] selftest: PASS — good/regressed fixtures classify correctly for all 3 files`);
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — escrow separation stays in sync with the driver-facing balance, settlement disbursement recording actually matches rows, and the pre-dispatch debt check reads a real column in the right units`);
