// SETTLEMENT-BILL-PAYMENT — the canonical driver-settlement GL posting engine (blueprint §3, LOCKED).
// TIER-1 FINANCIAL, BUILD-AND-HOLD. Flag SETTLEMENT_GL_POSTING_ENABLED (default OFF) => NO-OP.
//
// Posts a finalized/locked driver settlement (TRANSP-first, never cross-post) as Bill + BillPayment,
// with the driver as a VENDOR (for A/P aging + 1099/W-8BEN). Reuses the existing posting spine only —
// NO new GL math:
//   • ONE Bill per LOAD (from each driver_finance.driver_bills row), numbered with the load #:
//       createBill + one accounting.bill_lines(driver_pay_expense) -> postSourceTransaction('bill')
//       = Dr "Cost of Labor–Mexico Drivers" (gross) / Cr A/P (driver-vendor, QBO-47).
//   • Deductions reduce A/P and credit the DRIVER'S OWN sub-accounts (pay-first-then-escrow):
//       advance recovery -> Cr <driver's Cash-Advance ASSET sub>; escrow withhold -> Cr <driver's
//       Driver-Escrow LIABILITY sub>; every other bucket -> Cr its shared {type}_recovery role.
//       Posted as ONE balanced createJournalEntry (Dr A/P total / Cr each target). Each per-load Bill's
//       A/P is closed in the subledger by a NON-CASH bill_payment (from_bank_account_id NULL,
//       settlement_deduction_noncash=true) whose GL is OWNED by this deduction JE (the shared
//       bill-payment poster skips it) — so subledger A/P and GL A/P both net correctly.
//   • Net BillPayment: payBill(net, from Wells Fargo DIP) -> postSourceTransaction('bill_payment')
//       = Dr A/P / Cr Wells Fargo — DIP.
//
// Deductions are sourced ONLY from driver_finance.driver_settlement_deductions (the canonical bucketed
// ledger; the 5% editable net floor + pay-first ordering are enforced by the applier at close), so the
// net is gross(bills) − Σ(deductions) BY CONSTRUCTION — no SETTLEMENT_TOTALS_INCONSISTENT reliance on
// the settlement_lines header. Consent = the hire contract (blueprint §2/§4) — NO separate signed-
// deduction-authorization gate.
//
// FULL CONNECTIVITY (blueprint §9): driver_finance.driver_settlement_gl_runs (settlement -> driver ->
// vendor -> deduction JE) + driver_settlement_gl_bills (settlement -> each driver_bill -> load ->
// accounting.bills -> bill JE -> cash + non-cash bill_payments) — forward + reverse, no orphans.
//
// FOUNDATION-PR NOTE: this branch is cut from origin/main. Once the "per-driver account foundation" PR
// lands (accounting.escrow_accounts.coa_account_id holder=driver + the cash-advance link table), the
// driver sub-account resolver below prefers those stored ids; today it resolves the SAME per-driver
// sub-accounts by their canonical provisioned NAME (driver-subaccount-provision) and FAILS LOUD when a
// driver's own sub-account is not provisioned (never credits the shared recovery account for
// advance/escrow, never guesses).

import { withCurrentUser } from "../../auth/db.js";
import { isEnabled } from "../../lib/feature-flags/service.js";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { createBill, payBill } from "../bills.service.js";
import { createJournalEntry } from "../journal-entries.service.js";
import { postSourceTransaction, reversePostedSourceTransaction } from "../posting-engine.service.js";
import { resolveRoleAccountOptional } from "../coa-roles/resolver.service.js";
import {
  DRIVER_ADVANCE_PARENT_NAME,
  driverAdvanceSubAccountName,
  driverEscrowSubAccountName,
  planDriverEscrowSubAccount,
  planDriverSubAccount,
} from "../driver-subaccount-provision.service.js";
import {
  SETTLEMENT_GL_POSTING_FLAG_KEY,
  SettlementBillPaymentError,
  allocateDeductionsAcrossBills,
  assertBalanced,
  bucketRecoveryRoleKey,
  buildSettlementRunKey,
  classifyDeductionTarget,
  deductionOrderRank,
  type DeductionTarget,
} from "./settlement-bill-payment.math.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

type Actor = { userId: string };

const POSTABLE_STATUSES = new Set(["locked", "final", "closed", "paid", "approved", "ready"]);

export type SettlementBillPaymentResult =
  | { result: "skipped_flag_off"; settlement_id: string; run_id: null }
  | { result: "already_posted"; settlement_id: string; run_id: string }
  | {
      result: "posted";
      settlement_id: string;
      run_id: string;
      driver_vendor_id: string;
      bill_count: number;
      gross_cents: number;
      deductions_cents: number;
      net_cents: number;
      deduction_journal_entry_id: string | null;
    };

type SettlementRow = {
  id: string;
  driver_id: string;
  display_id: string | null;
  status: string;
  locked_at: string | null;
  period_end: string;
};

type DriverBillRow = {
  id: string;
  load_id: string;
  load_number: string | null;
  gross_amount_cents: number;
};

type DeductionRow = {
  id: string;
  deduction_type: string;
  amount_cents: number;
  bucket_type: string | null;
  load_id: string | null;
  source_expense_id: string | null;
};

function scoped<T>(actor: Actor, operatingCompanyId: string, fn: (client: DbClient) => Promise<T>): Promise<T> {
  return withCurrentUser(actor.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    return fn(client as DbClient);
  });
}

/** Resolve an account bound to role_key in catalogs.account_role_bindings, pinned to this entity. */
async function resolveRoleBindingAccount(client: DbClient, operatingCompanyId: string, roleKey: string): Promise<string | null> {
  const res = await client.query<{ account_id: string }>(
    `
      SELECT arb.account_id::text AS account_id
      FROM catalogs.account_role_bindings arb
      JOIN catalogs.accounts a ON a.id = arb.account_id
      WHERE arb.role_key = $1
        AND arb.deactivated_at IS NULL
        AND a.deactivated_at IS NULL
        AND a.is_postable = true
        AND (arb.operating_company_id = $2::uuid OR arb.operating_company_id IS NULL)
        AND a.operating_company_id = $2::uuid
      ORDER BY (arb.operating_company_id IS NOT NULL) DESC
      LIMIT 1
    `,
    [roleKey, operatingCompanyId]
  );
  return res.rows[0]?.account_id ?? null;
}

/**
 * Resolve the DIP bank account (banking.bank_accounts row) whose GL bridge (ledger_account_id) is the
 * account bound to the cash_dip role — so payBill(from that bank) + the bill-payment poster credit the
 * Wells Fargo — DIP cash account (never a hardcoded id). NULL when unmapped (caller fails loud).
 */
async function resolveDipBankAccountId(client: DbClient, operatingCompanyId: string): Promise<string | null> {
  const res = await client.query<{ bank_account_id: string }>(
    `
      SELECT ba.id::text AS bank_account_id
      FROM banking.bank_accounts ba
      JOIN catalogs.account_role_bindings arb
        ON arb.account_id = ba.ledger_account_id
       AND arb.role_key = 'cash_dip'
       AND arb.deactivated_at IS NULL
       AND (arb.operating_company_id = $1::uuid OR arb.operating_company_id IS NULL)
      WHERE ba.operating_company_id = $1::uuid
        AND ba.ledger_account_id IS NOT NULL
      ORDER BY (arb.operating_company_id IS NOT NULL) DESC
      LIMIT 1
    `,
    [operatingCompanyId]
  );
  return res.rows[0]?.bank_account_id ?? null;
}

/**
 * The driver's OWN per-driver sub-account (blueprint §4). Prefers the foundation-stored id
 * (accounting.escrow_accounts holder=driver for escrow) when present, else the canonical provisioned
 * NAME (driver-subaccount-provision). NEVER returns the shared recovery/default account — advance and
 * escrow credits must land on the driver's OWN asset/liability sub-account or FAIL LOUD.
 */
async function resolveDriverOwnAccount(
  client: DbClient,
  operatingCompanyId: string,
  driverId: string,
  driverName: string,
  kind: "advance" | "escrow",
  hireDate?: string | Date | null
): Promise<string | null> {
  // Foundation link (guarded so it is safe before that PR merges).
  if (kind === "escrow") {
    const reg = await client.query<{ ok: boolean }>(`SELECT to_regclass('accounting.escrow_accounts') IS NOT NULL AS ok`);
    if (reg.rows[0]?.ok) {
      const found = await client.query<{ account_id: string }>(
        `
          SELECT ea.coa_account_id::text AS account_id
          FROM accounting.escrow_accounts ea
          JOIN catalogs.accounts a ON a.id = ea.coa_account_id
          WHERE ea.operating_company_id = $1::uuid
            AND ea.holder_id = $2::uuid
            AND ea.holder_type = 'driver'
            AND a.parent_account_id IS NOT NULL      -- a per-driver SUB-account, never the shared default
            AND a.deactivated_at IS NULL
            AND a.is_postable = true
            AND a.operating_company_id = $1::uuid
          LIMIT 1
        `,
        [operatingCompanyId, driverId]
      );
      if (found.rows[0]?.account_id) return found.rows[0].account_id;
    }
    // Canonical provisioned per-driver escrow leaf: two-level nesting under the year-agnostic
    // "Driver Escrow" sub-parent, itself under top-level "Damage Claim Escrow" (STOP-DECISION #1).
    const subAccountName = driverEscrowSubAccountName(driverName, hireDate ?? null);
    const plan = await planDriverEscrowSubAccount(client, { subAccountName, operatingCompanyId });
    if (plan.action === "skip_exists") return plan.existingId;
    return null;
  }
  // Canonical provisioned per-driver sub-account, resolved by its stable business name (flat, single-level).
  const subAccountName = driverAdvanceSubAccountName(driverName);
  const plan = await planDriverSubAccount(client, {
    parentName: DRIVER_ADVANCE_PARENT_NAME,
    parentType: "Asset",
    subAccountName,
    operatingCompanyId,
  });
  if (plan.action === "skip_exists") return plan.existingId;
  return null;
}

async function loadSettlement(client: DbClient, operatingCompanyId: string, settlementId: string): Promise<SettlementRow> {
  const res = await client.query<SettlementRow>(
    `
      SELECT id::text, driver_id::text, display_id, status, locked_at::text, period_end::text
      FROM driver_finance.driver_settlements
      WHERE operating_company_id = $1::uuid AND id = $2::uuid
      LIMIT 1
      FOR UPDATE
    `,
    [operatingCompanyId, settlementId]
  );
  const row = res.rows[0];
  if (!row) throw new SettlementBillPaymentError("SETTLEMENT_NOT_FOUND", `Settlement ${settlementId} not found`);
  return row;
}

async function loadDriverBills(client: DbClient, operatingCompanyId: string, settlementId: string, driverId: string): Promise<DriverBillRow[]> {
  // Primary link: settlement_lines.source_driver_bill_id (the load-bookended close's bill->line link);
  // secondary: driver_bills.settled_in_settlement_id (stamped by this engine). Union both, dedup, order
  // by creation so the load# numbering + deduction allocation are deterministic.
  const res = await client.query<DriverBillRow>(
    `
      SELECT db.id::text, db.load_id::text, db.load_number, db.gross_amount_cents::int AS gross_amount_cents
      FROM driver_finance.driver_bills db
      WHERE db.operating_company_id = $1::uuid
        AND db.driver_id = $3::uuid
        AND db.status <> 'void'
        AND (
          db.settled_in_settlement_id = $2::uuid
          OR db.id IN (
            SELECT sl.source_driver_bill_id
            FROM driver_finance.settlement_lines sl
            WHERE sl.settlement_id = $2::uuid AND sl.source_driver_bill_id IS NOT NULL
          )
        )
      ORDER BY db.created_at ASC, db.id ASC
    `,
    [operatingCompanyId, settlementId, driverId]
  );
  return res.rows.map((r) => ({ ...r, gross_amount_cents: Math.max(0, Math.round(Number(r.gross_amount_cents ?? 0))) }));
}

async function loadDeductions(client: DbClient, operatingCompanyId: string, settlementId: string): Promise<DeductionRow[]> {
  const res = await client.query<DeductionRow>(
    `
      SELECT dsd.id::text, dsd.deduction_type, dsd.amount_cents::bigint AS amount_cents,
             ddb.bucket_type, dsd.load_id::text, dsd.source_expense_id::text
      FROM driver_finance.driver_settlement_deductions dsd
      LEFT JOIN driver_finance.driver_deduction_buckets ddb ON ddb.id = dsd.bucket_id
      WHERE dsd.operating_company_id = $1::uuid
        AND dsd.applied_to_settlement_id = $2::uuid
      ORDER BY dsd.created_at ASC, dsd.id ASC
    `,
    [operatingCompanyId, settlementId]
  );
  return res.rows
    .map((r) => ({ ...r, amount_cents: Math.max(0, Math.round(Number(r.amount_cents ?? 0))) }))
    .filter((r) => r.amount_cents > 0);
}

/**
 * Post a finalized/locked driver settlement to the GL as Bill + BillPayment. Flag-gated (OFF => no-op).
 * Idempotent (driver_settlement_gl_runs / _bills), re-entrant across the sequential createBill/payBill
 * commits. Reuses the accounting spine end-to-end, fails loud.
 */
export async function postSettlementBillPayment(
  input: { operatingCompanyId: string; settlementId: string },
  actor: Actor
): Promise<SettlementBillPaymentResult> {
  const opco = input.operatingCompanyId;
  const settlementId = input.settlementId;

  // ── FLAG GATE — OFF => ZERO writes, checked before any read/lock/insert. ──────────────────────────
  const flagOn = await scoped(actor, opco, (client) =>
    isEnabled(client as never, SETTLEMENT_GL_POSTING_FLAG_KEY, { operating_company_id: opco, user_uuid: actor.userId })
  );
  if (!flagOn) return { result: "skipped_flag_off", settlement_id: settlementId, run_id: null };

  // ── Resolve everything + claim the run row (idempotency anchor) in ONE scoped transaction. ────────
  const prep = await scoped(actor, opco, async (client) => {
    const settlement = await loadSettlement(client, opco, settlementId);
    if (settlement.locked_at == null && !POSTABLE_STATUSES.has(settlement.status)) {
      throw new SettlementBillPaymentError(
        "SETTLEMENT_NOT_POSTABLE",
        `Settlement ${settlement.display_id ?? settlement.id} is not finalized/locked (status=${settlement.status})`
      );
    }

    // Existing run? (already_posted short-circuit)
    const existingRun = await client.query<{ id: string; status: string }>(
      `SELECT id::text, status FROM driver_finance.driver_settlement_gl_runs
        WHERE operating_company_id = $1::uuid AND settlement_id = $2::uuid LIMIT 1 FOR UPDATE`,
      [opco, settlementId]
    );
    const runRow = existingRun.rows[0] ?? null;
    if (runRow && runRow.status === "posted") {
      return { alreadyPosted: true as const, runId: runRow.id };
    }

    // Driver vendor + name (+ hire_date, needed for the escrow leaf's stable name-with-hire-date).
    const driverRes = await client.query<{ qbo_vendor_id: string | null; driver_name: string; hire_date: string | null }>(
      `SELECT qbo_vendor_id, concat_ws(' ', first_name, last_name) AS driver_name, hire_date::text AS hire_date
         FROM mdata.drivers WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
      [settlement.driver_id, opco]
    );
    const driverName = String(driverRes.rows[0]?.driver_name ?? "").trim();
    const driverHireDate = driverRes.rows[0]?.hire_date ?? null;
    const driverVendorId = String(driverRes.rows[0]?.qbo_vendor_id ?? settlement.driver_id).trim();
    if (!driverVendorId) {
      throw new SettlementBillPaymentError("DRIVER_VENDOR_MISSING", `No vendor linkage for driver ${settlement.driver_id}`);
    }

    // Per-load bills + deductions.
    const bills = await loadDriverBills(client, opco, settlementId, settlement.driver_id);
    if (bills.length === 0) {
      throw new SettlementBillPaymentError("NO_LOAD_BILLS", `Settlement ${settlement.display_id ?? settlementId} has no per-load driver bills to post`);
    }
    const deductions = await loadDeductions(client, opco, settlementId);

    // Role accounts — missing => STOP, never guess.
    const driverPayAccount = await resolveRoleBindingAccount(client, opco, "driver_pay_expense");
    if (!driverPayAccount) {
      throw new SettlementBillPaymentError("DRIVER_PAY_ACCOUNT_MISSING", "No active 'driver_pay_expense' role binding (Cost of Labor–Mexico Drivers)");
    }
    const apAccount = await resolveRoleAccountOptional(client, opco, "ap_control");
    if (!apAccount) throw new SettlementBillPaymentError("AP_ACCOUNT_MISSING", "No A/P control account (ap_control) designated");

    const dipBankAccountId = await resolveDipBankAccountId(client, opco);
    if (!dipBankAccountId) {
      throw new SettlementBillPaymentError("DIP_BANK_MISSING", "No DIP bank account (cash_dip role -> banking.bank_accounts.ledger_account_id) resolved");
    }

    // Resolve each deduction's credit target account (pay-first-then-escrow order).
    const gross = bills.reduce((s, b) => s + b.gross_amount_cents, 0);
    const totalDeductions = deductions.reduce((s, d) => s + d.amount_cents, 0);
    if (totalDeductions > gross) {
      throw new SettlementBillPaymentError(
        "SETTLEMENT_TOTALS_INCONSISTENT",
        `Applied deductions (${totalDeductions}c) exceed gross of per-load bills (${gross}c) — the 5% net floor should prevent this`,
        { gross_cents: gross, deductions_cents: totalDeductions }
      );
    }

    type ResolvedDeduction = DeductionRow & { target: DeductionTarget; accountId: string };
    const resolvedDeductions: ResolvedDeduction[] = [];
    for (const d of deductions) {
      const target = classifyDeductionTarget(d.deduction_type, d.bucket_type);
      let accountId: string | null;
      if (target === "advance") {
        accountId = await resolveDriverOwnAccount(client, opco, settlement.driver_id, driverName, "advance");
        if (!accountId) {
          throw new SettlementBillPaymentError(
            "DRIVER_ADVANCE_ACCOUNT_MISSING",
            `Driver ${settlement.driver_id} has no provisioned Cash-Advance ASSET sub-account for advance recovery`,
            { deduction_id: d.id, deduction_type: d.deduction_type }
          );
        }
      } else if (target === "escrow") {
        accountId = await resolveDriverOwnAccount(client, opco, settlement.driver_id, driverName, "escrow", driverHireDate);
        if (!accountId) {
          throw new SettlementBillPaymentError(
            "DRIVER_ESCROW_ACCOUNT_MISSING",
            `Driver ${settlement.driver_id} has no provisioned Driver-Escrow LIABILITY sub-account for escrow withholding`,
            { deduction_id: d.id, deduction_type: d.deduction_type }
          );
        }
      } else {
        const roleKey = bucketRecoveryRoleKey(d.deduction_type);
        accountId = await resolveRoleBindingAccount(client, opco, roleKey);
        if (!accountId) {
          throw new SettlementBillPaymentError(
            "DEDUCTION_RECOVERY_ACCOUNT_MISSING",
            `No active '${roleKey}' role binding for deduction bucket '${d.deduction_type}'`,
            { deduction_id: d.id, role_key: roleKey }
          );
        }
      }
      resolvedDeductions.push({ ...d, target, accountId });
    }
    resolvedDeductions.sort((a, b) => deductionOrderRank(a.target) - deductionOrderRank(b.target));

    // Claim / upsert the run row.
    const runKey = buildSettlementRunKey(opco, settlementId);
    let runId = runRow?.id ?? "";
    if (!runId) {
      const ins = await client.query<{ id: string }>(
        `
          INSERT INTO driver_finance.driver_settlement_gl_runs
            (operating_company_id, settlement_id, driver_id, driver_vendor_id, run_key,
             gross_cents, deductions_cents, net_cents, status, posted_by_user_id)
          VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, 'posted', $9::uuid)
          ON CONFLICT (operating_company_id, settlement_id) DO NOTHING
          RETURNING id::text
        `,
        [opco, settlementId, settlement.driver_id, driverVendorId, runKey, gross, totalDeductions, gross - totalDeductions, actor.userId]
      );
      runId = ins.rows[0]?.id ?? "";
      if (!runId) {
        const again = await client.query<{ id: string }>(
          `SELECT id::text FROM driver_finance.driver_settlement_gl_runs WHERE operating_company_id=$1::uuid AND settlement_id=$2::uuid LIMIT 1`,
          [opco, settlementId]
        );
        runId = again.rows[0]?.id ?? "";
      }
    }
    if (!runId) throw new Error("settlement_gl_run_claim_failed");

    // Existing per-bill rows (re-entrancy).
    const existingBills = await client.query<{
      driver_bill_id: string;
      accounting_bill_id: string;
      bill_journal_entry_id: string | null;
      cash_bill_payment_id: string | null;
      deduction_bill_payment_id: string | null;
    }>(
      `SELECT driver_bill_id::text, accounting_bill_id::text, bill_journal_entry_id::text,
              cash_bill_payment_id::text, deduction_bill_payment_id::text
         FROM driver_finance.driver_settlement_gl_bills WHERE run_id = $1::uuid`,
      [runId]
    );
    const doneByBill = new Map(existingBills.rows.map((r) => [r.driver_bill_id, r]));

    const runDedJe = await client.query<{ deduction_journal_entry_id: string | null }>(
      `SELECT deduction_journal_entry_id::text FROM driver_finance.driver_settlement_gl_runs WHERE id = $1::uuid`,
      [runId]
    );

    return {
      alreadyPosted: false as const,
      settlement,
      driverName,
      driverVendorId,
      driverPayAccount,
      apAccount,
      dipBankAccountId,
      bills,
      resolvedDeductions,
      gross,
      totalDeductions,
      runId,
      doneByBill,
      deductionJournalEntryId: runDedJe.rows[0]?.deduction_journal_entry_id ?? null,
    };
  });

  if (prep.alreadyPosted) return { result: "already_posted", settlement_id: settlementId, run_id: prep.runId };

  const {
    settlement,
    driverVendorId,
    driverPayAccount,
    apAccount,
    dipBankAccountId,
    bills,
    resolvedDeductions,
    gross,
    totalDeductions,
    runId,
    doneByBill,
  } = prep;
  let deductionJournalEntryId = prep.deductionJournalEntryId;

  const billDate = settlement.period_end;
  const label = `Settlement ${settlement.display_id ?? settlement.id}`;

  // Allocate the total deduction across the per-load bills (oldest first) so each Bill closes.
  const allocation = allocateDeductionsAcrossBills(bills.map((b) => b.gross_amount_cents), totalDeductions);

  // ── Per-load Bills + non-cash deduction closure + net cash BillPayment (each self-scoping). ───────
  for (let i = 0; i < bills.length; i += 1) {
    const b = bills[i]!;
    const alloc = allocation[i]!;
    const already = doneByBill.get(b.id);

    let accountingBillId = already?.accounting_bill_id ?? "";
    let billJeId = already?.bill_journal_entry_id ?? null;
    let cashBpId = already?.cash_bill_payment_id ?? null;
    let deductionBpId = already?.deduction_bill_payment_id ?? null;

    // (a) create the Bill (numbered by load#) + one driver-pay expense line + post its A/P leg.
    if (!accountingBillId) {
      const bill = await createBill(
        {
          operatingCompanyId: opco,
          vendorId: driverVendorId,
          billNumber: String(b.load_number ?? b.load_id),
          billDate,
          amountCents: b.gross_amount_cents,
          memo: `${label} — driver pay, load ${b.load_number ?? b.load_id}`,
          coaAccountId: driverPayAccount,
        },
        actor.userId
      );
      accountingBillId = bill.id;
      // The GL poster reads accounting.bill_lines (not coa_account_id) — add the single driver-pay line.
      await scoped(actor, opco, (client) =>
        client.query(
          `INSERT INTO accounting.bill_lines (bill_id, line_sequence, amount, description, account_id)
           VALUES ($1::uuid, 1, $2, $3, $4::uuid)
           ON CONFLICT (bill_id, line_sequence) DO NOTHING`,
          [accountingBillId, b.gross_amount_cents / 100, `Load ${b.load_number ?? b.load_id} — Cost of Labor–Mexico Drivers`, driverPayAccount]
        )
      );
    }
    if (!billJeId) {
      const billPost = await postSourceTransaction(
        { operating_company_id: opco, source_transaction_type: "bill", source_transaction_id: accountingBillId, posting_purpose: "initial_post" },
        { userId: actor.userId }
      );
      billJeId = billPost.journal_entry_id;
    }

    // (b) NON-CASH deduction bill_payment closes the deduction share (GL owned by the deduction JE).
    if (alloc.deductionCents > 0 && !deductionBpId) {
      const dedPayment = await payBill(
        {
          operatingCompanyId: opco,
          billId: accountingBillId,
          paymentDate: billDate,
          amountCents: alloc.deductionCents,
          paymentMethod: "other",
          memo: `${label} — deduction recovery (non-cash), load ${b.load_number ?? b.load_id}`,
        },
        actor.userId
      );
      deductionBpId = dedPayment.id;
      await scoped(actor, opco, (client) =>
        client.query(
          `UPDATE accounting.bill_payments SET settlement_deduction_noncash = true, updated_at = now()
            WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
          [deductionBpId, opco]
        )
      );
    }

    // (c) net cash BillPayment from Wells Fargo — DIP + post Dr A/P / Cr DIP.
    let cashJeId: string | null = null;
    if (alloc.cashCents > 0 && !cashBpId) {
      const cashPayment = await payBill(
        {
          operatingCompanyId: opco,
          billId: accountingBillId,
          paymentDate: billDate,
          amountCents: alloc.cashCents,
          paymentMethod: "ach",
          fromBankAccountId: dipBankAccountId,
          memo: `${label} — net driver pay, load ${b.load_number ?? b.load_id}`,
        },
        actor.userId
      );
      cashBpId = cashPayment.id;
      const cashPost = await postSourceTransaction(
        { operating_company_id: opco, source_transaction_type: "bill_payment", source_transaction_id: cashBpId, posting_purpose: "initial_post" },
        { userId: actor.userId }
      );
      cashJeId = cashPost.journal_entry_id;
    }

    // (d) connectivity: stamp the driver_bill + persist the per-load link row (upsert for re-entrancy).
    await scoped(actor, opco, async (client) => {
      await client.query(
        `UPDATE driver_finance.driver_bills
            SET settled_in_settlement_id = $2::uuid, status = 'paid', updated_at = now()
          WHERE id = $1::uuid AND operating_company_id = $3::uuid AND status <> 'void'`,
        [b.id, settlementId, opco]
      );
      await client.query(
        `
          INSERT INTO driver_finance.driver_settlement_gl_bills
            (operating_company_id, run_id, settlement_id, driver_bill_id, load_id, load_number,
             accounting_bill_id, bill_journal_entry_id, cash_bill_payment_id, cash_journal_entry_id,
             deduction_bill_payment_id, gross_cents, deduction_cents, cash_cents)
          VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,$7::uuid,$8::uuid,$9::uuid,$10::uuid,$11::uuid,$12,$13,$14)
          ON CONFLICT (operating_company_id, driver_bill_id) DO UPDATE SET
            accounting_bill_id = EXCLUDED.accounting_bill_id,
            bill_journal_entry_id = COALESCE(EXCLUDED.bill_journal_entry_id, driver_settlement_gl_bills.bill_journal_entry_id),
            cash_bill_payment_id = COALESCE(EXCLUDED.cash_bill_payment_id, driver_settlement_gl_bills.cash_bill_payment_id),
            cash_journal_entry_id = COALESCE(EXCLUDED.cash_journal_entry_id, driver_settlement_gl_bills.cash_journal_entry_id),
            deduction_bill_payment_id = COALESCE(EXCLUDED.deduction_bill_payment_id, driver_settlement_gl_bills.deduction_bill_payment_id)
        `,
        [opco, runId, settlementId, b.id, b.load_id, b.load_number, accountingBillId, billJeId, cashBpId, cashJeId, deductionBpId, b.gross_amount_cents, alloc.deductionCents, alloc.cashCents]
      );
    });
  }

  // ── Deduction JE (ONE balanced entry): Dr A/P (total) / Cr each driver-own-or-recovery target. ───
  if (totalDeductions > 0 && !deductionJournalEntryId) {
    const postings = [
      { account_id: apAccount, debit_or_credit: "debit" as const, amount_cents: totalDeductions, description: `${label} — A/P reduced by deductions` },
      ...resolvedDeductions.map((d) => ({
        account_id: d.accountId,
        debit_or_credit: "credit" as const,
        amount_cents: d.amount_cents,
        description:
          d.target === "advance"
            ? `${label} — advance recovery -> driver cash-advance`
            : d.target === "escrow"
              ? `${label} — escrow withhold -> driver escrow`
              : `${label} — ${d.deduction_type} recovery`,
      })),
    ];
    assertBalanced(postings);
    const je = await createJournalEntry(
      { operating_company_id: opco, entry_date: billDate, memo: `${label} — settlement deductions (Dr A/P / Cr driver accounts)`, source: "auto", postings },
      { userId: actor.userId, role: "system" }
    );
    deductionJournalEntryId = je.id;
    await scoped(actor, opco, (client) =>
      client.query(
        `UPDATE driver_finance.driver_settlement_gl_runs SET deduction_journal_entry_id = $2::uuid, updated_at = now() WHERE id = $1::uuid`,
        [runId, deductionJournalEntryId]
      )
    );
  }

  // ── Finalize the run + immutable audit. ──────────────────────────────────────────────────────────
  await scoped(actor, opco, async (client) => {
    await client.query(
      `UPDATE driver_finance.driver_settlement_gl_runs
          SET gross_cents = $2, deductions_cents = $3, net_cents = $4, status = 'posted', updated_at = now()
        WHERE id = $1::uuid`,
      [runId, gross, totalDeductions, gross - totalDeductions]
    );
    await appendCrudAudit(
      client as never,
      actor.userId,
      "accounting.settlement.bill_payment_posted",
      {
        resource_type: "driver_finance.driver_settlements",
        resource_id: settlementId,
        operating_company_id: opco,
        run_id: runId,
        driver_id: settlement.driver_id,
        driver_vendor_id: driverVendorId,
        bill_count: bills.length,
        gross_cents: gross,
        deductions_cents: totalDeductions,
        net_cents: gross - totalDeductions,
        deduction_journal_entry_id: deductionJournalEntryId,
      },
      "info",
      "SETTLEMENT-BILL-PAYMENT"
    );
  });

  return {
    result: "posted",
    settlement_id: settlementId,
    run_id: runId,
    driver_vendor_id: driverVendorId,
    bill_count: bills.length,
    gross_cents: gross,
    deductions_cents: totalDeductions,
    net_cents: gross - totalDeductions,
    deduction_journal_entry_id: deductionJournalEntryId,
  };
}

export type SettlementBillPaymentReversalResult = {
  result: "reversed" | "nothing_to_reverse";
  settlement_id: string;
  run_id: string | null;
};

/**
 * Reverse a posted settlement (void-not-delete): post equal-and-opposite reversing entries for each
 * per-load bill + cash bill_payment (reversePostedSourceTransaction), post a reversing deduction JE
 * (Dr each target / Cr A/P), and flip the run to 'reversed'. The non-cash deduction bill_payments carry
 * no GL of their own, so only the deduction JE is reversed for them.
 */
export async function reverseSettlementBillPayment(
  input: { operatingCompanyId: string; settlementId: string; reason: string },
  actor: Actor
): Promise<SettlementBillPaymentReversalResult> {
  const opco = input.operatingCompanyId;
  const settlementId = input.settlementId;

  const run = await scoped(actor, opco, async (client) => {
    const r = await client.query<{ id: string; status: string; deduction_journal_entry_id: string | null }>(
      `SELECT id::text, status, deduction_journal_entry_id::text
         FROM driver_finance.driver_settlement_gl_runs
        WHERE operating_company_id = $1::uuid AND settlement_id = $2::uuid LIMIT 1 FOR UPDATE`,
      [opco, settlementId]
    );
    return r.rows[0] ?? null;
  });
  if (!run || run.status !== "posted") {
    return { result: "nothing_to_reverse", settlement_id: settlementId, run_id: run?.id ?? null };
  }

  const glBills = await scoped(actor, opco, async (client) => {
    const r = await client.query<{
      accounting_bill_id: string;
      cash_bill_payment_id: string | null;
      deduction_bill_payment_id: string | null;
    }>(
      `SELECT accounting_bill_id::text, cash_bill_payment_id::text, deduction_bill_payment_id::text
         FROM driver_finance.driver_settlement_gl_bills WHERE run_id = $1::uuid`,
      [run.id]
    );
    return r.rows;
  });

  // Reverse cash payments + bill A/P legs (posting-engine reversal is idempotent).
  for (const gb of glBills) {
    if (gb.cash_bill_payment_id) {
      await reversePostedSourceTransaction(
        { operating_company_id: opco, source_transaction_type: "bill_payment", source_transaction_id: gb.cash_bill_payment_id },
        { userId: actor.userId }
      ).catch(() => undefined);
    }
    await reversePostedSourceTransaction(
      { operating_company_id: opco, source_transaction_type: "bill", source_transaction_id: gb.accounting_bill_id },
      { userId: actor.userId }
    ).catch(() => undefined);
  }

  // Reverse the deduction JE by posting its mirror (Dr each target / Cr A/P).
  if (run.deduction_journal_entry_id) {
    const lines = await scoped(actor, opco, async (client) => {
      const r = await client.query<{ account_id: string; debit_or_credit: "debit" | "credit"; amount_cents: number; description: string | null }>(
        `SELECT account_id::text, debit_or_credit, amount_cents::bigint AS amount_cents, description
           FROM accounting.journal_entry_postings WHERE journal_entry_uuid = $1::uuid ORDER BY line_sequence ASC`,
        [run.deduction_journal_entry_id]
      );
      return r.rows;
    });
    if (lines.length >= 2) {
      await createJournalEntry(
        {
          operating_company_id: opco,
          entry_date: new Date().toISOString().slice(0, 10),
          memo: `REVERSAL — settlement ${settlementId} deductions: ${input.reason}`,
          source: "auto",
          postings: lines.map((l) => ({
            account_id: l.account_id,
            debit_or_credit: l.debit_or_credit === "debit" ? ("credit" as const) : ("debit" as const),
            amount_cents: Number(l.amount_cents),
            description: `REVERSAL: ${l.description ?? ""}`.trim(),
          })),
        },
        { userId: actor.userId, role: "system" }
      );
    }
  }

  await scoped(actor, opco, async (client) => {
    await client.query(
      `UPDATE driver_finance.driver_settlement_gl_runs
          SET status = 'reversed', reversed_at = now(), reversed_by_user_id = $2::uuid, reversal_reason = $3, updated_at = now()
        WHERE id = $1::uuid`,
      [run.id, actor.userId, input.reason]
    );
    await appendCrudAudit(
      client as never,
      actor.userId,
      "accounting.settlement.bill_payment_reversed",
      {
        resource_type: "driver_finance.driver_settlements",
        resource_id: settlementId,
        operating_company_id: opco,
        run_id: run.id,
        reason: input.reason,
      },
      "warning",
      "SETTLEMENT-BILL-PAYMENT"
    );
  });

  return { result: "reversed", settlement_id: settlementId, run_id: run.id };
}
