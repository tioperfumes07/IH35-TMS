// SETTLEMENT PAY-RUN CLOSE — net + escrow-cap + advance-recovery + records-only disbursement (Phase 2b).
// TIER-1 FINANCIAL, BUILD-AND-HOLD. Flag SETTLEMENT_GL_POSTING_ENABLED (default OFF) => PREVIEW ONLY,
// post NOTHING (compute + return the balanced JE preview; zero journal entries / financial rows written).
//
// This EXTENDS the driver-settlement close with the pay-run-specific movements (owner GO 2026-07-13),
// reusing the EXISTING accounting spine — NO new GL math, NO parallel poster:
//   NET = gross − deductions − escrow_contribution − advance_recoveries − chargebacks
// and posts them as additional BALANCED legs through the EXISTING balanced-JE poster
// (accounting/journal-entries.service.ts createJournalEntry — debits==credits or it aborts):
//   Dr driver-pay expense (gross)
//   Cr per-bucket {type}_recovery role account            (deductions)
//   Cr abandonment_chargeback_recovery role account       (chargebacks)
//   Cr cash-advance clearing (advance_recovery role)      (advance_recoveries)
//   Cr the driver's OWN Damage-Claim escrow LIABILITY sub-account (escrow_contribution, I3 capped @ $2,000
//      via escrow-resolver.service.ts — resolved BY THE DRIVER-KEYED BRIDGE, asserted Liability + NOT Faro)
//   Cr cash/bank from the chosen catalogs.payment_methods.gl_account_id (net)
//
// I3 escrow: contribute (never release) until the driver's escrow balance reaches $2,000 (cap → 0).
// Advance recovery (reuse point 3): recover the driver's un-recovered driver_finance.driver_advances
//   (recovered_in_settlement_id IS NULL) at close, stamping recovered_in_settlement_id — IDEMPOTENT
//   (the WHERE recovered_in_settlement_id IS NULL guard means a re-run never double-recovers).
// Disbursement (reuse point 5): TMS RECORDS the net disbursement via the chosen payment method (both-way
//   bank-txn linkage) but NEVER moves money — records-only.

import { withCurrentUser } from "../auth/db.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { createJournalEntry } from "../accounting/journal-entries.service.js";
import {
  DEFAULT_ESCROW_PER_SETTLEMENT_CONTRIBUTION_CENTS,
  computeCappedEscrowContributionCents,
  readDriverEscrowBalanceCents,
  resolveDriverEscrowLiabilityAccount,
} from "./escrow-resolver.service.js";
import {
  SETTLEMENT_GL_POSTING_FLAG_KEY,
  bucketRecoveryRoleKey,
  classifyDeductionTarget,
  dollarsToCents,
} from "../accounting/settlement-posting/settlement-bill-payment.math.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

type Actor = { userId: string };

const POSTABLE_STATUSES = new Set(["locked", "final", "closed", "paid", "approved", "ready"]);

export type PayRunCloseErrorCode =
  | "SETTLEMENT_NOT_FOUND"
  | "SETTLEMENT_NOT_POSTABLE"
  | "PAYMENT_METHOD_INVALID"
  | "PAYMENT_METHOD_NO_GL_ACCOUNT"
  | "DRIVER_PAY_ACCOUNT_MISSING"
  | "DEDUCTION_RECOVERY_ACCOUNT_MISSING"
  | "ADVANCE_CLEARING_ACCOUNT_MISSING"
  | "CHARGEBACK_RECOVERY_ACCOUNT_MISSING"
  | "NET_PAY_NEGATIVE"
  | "UNBALANCED_ENTRY";

export class SettlementPayRunError extends Error {
  code: PayRunCloseErrorCode;
  details?: Record<string, unknown>;
  constructor(code: PayRunCloseErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "SettlementPayRunError";
    this.code = code;
    this.details = details;
  }
}

type SettlementRow = {
  id: string;
  driver_id: string;
  display_id: string | null;
  status: string;
  locked_at: string | null;
  period_end: string;
  gross_pay: string;
};

export type PayRunNetBreakdown = {
  gross_cents: number;
  deductions_cents: number;
  chargebacks_cents: number;
  advance_recoveries_cents: number;
  escrow_contribution_cents: number;
  escrow_balance_before_cents: number;
  net_cents: number;
};

export type PayRunJeLegPreview = {
  account_id: string;
  debit_or_credit: "debit" | "credit";
  amount_cents: number;
  description: string;
};

export type RecoverableAdvance = { id: string; display_id: string | null; amount_cents: number };

export type SettlementPayRunResult = {
  result: "previewed" | "posted";
  posting_enabled: boolean;
  settlement_id: string;
  journal_entry_id: string | null;
  breakdown: PayRunNetBreakdown;
  recovered_advance_ids: string[];
  je_preview: PayRunJeLegPreview[];
  disbursement: { recorded: boolean; payment_method_id: string | null; payment_method_name: string | null };
};

function scoped<T>(actor: Actor, operatingCompanyId: string, fn: (client: DbClient) => Promise<T>): Promise<T> {
  return withCurrentUser(actor.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    return fn(client as DbClient);
  });
}

/** Resolve an account bound to role_key (entity-pinned; legacy NULL-entity bindings allowed, entity preferred). */
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

async function loadSettlement(client: DbClient, operatingCompanyId: string, settlementId: string): Promise<SettlementRow> {
  const res = await client.query<SettlementRow>(
    `
      SELECT id::text, driver_id::text, display_id, status, locked_at::text, period_end::text, gross_pay::text
      FROM driver_finance.driver_settlements
      WHERE operating_company_id = $1::uuid AND id = $2::uuid
      LIMIT 1
      FOR UPDATE
    `,
    [operatingCompanyId, settlementId]
  );
  const row = res.rows[0];
  if (!row) throw new SettlementPayRunError("SETTLEMENT_NOT_FOUND", `Settlement ${settlementId} not found`);
  return row;
}

/**
 * The general bucketed deductions applied to this settlement, aggregated by their {type}_recovery role.
 * EXCLUDES advance- and escrow-classified rows (the pay-run computes those from the advance ledger and the
 * escrow cap directly, so they are never double-counted) and abandonment/chargeback rows (handled as their
 * own term from settlement_lines). Amounts are in cents.
 */
async function loadOtherDeductionsByRole(
  client: DbClient,
  operatingCompanyId: string,
  settlementId: string
): Promise<Map<string, number>> {
  const res = await client.query<{ deduction_type: string; bucket_type: string | null; amount_cents: string }>(
    `
      SELECT dsd.deduction_type, ddb.bucket_type, dsd.amount_cents::bigint AS amount_cents
      FROM driver_finance.driver_settlement_deductions dsd
      LEFT JOIN driver_finance.driver_deduction_buckets ddb ON ddb.id = dsd.bucket_id
      WHERE dsd.operating_company_id = $1::uuid
        AND dsd.applied_to_settlement_id = $2::uuid
    `,
    [operatingCompanyId, settlementId]
  );
  const byRole = new Map<string, number>();
  for (const r of res.rows) {
    const cents = Math.max(0, Math.round(Number(r.amount_cents ?? 0)));
    if (cents <= 0) continue;
    const t = String(r.deduction_type ?? "").trim().toLowerCase();
    // Advance + escrow are computed by the pay-run itself; chargeback/abandonment is its own term below.
    const target = classifyDeductionTarget(r.deduction_type, r.bucket_type);
    if (target === "advance" || target === "escrow") continue;
    if (t.includes("abandon") || t.includes("chargeback")) continue;
    const roleKey = bucketRecoveryRoleKey(r.deduction_type);
    byRole.set(roleKey, (byRole.get(roleKey) ?? 0) + cents);
  }
  return byRole;
}

/** SUM of abandonment-chargeback settlement lines (cents, positive magnitude). */
async function loadChargebacksCents(client: DbClient, operatingCompanyId: string, settlementId: string): Promise<number> {
  const res = await client.query<{ total: string | null }>(
    `
      SELECT COALESCE(SUM(ABS(sl.amount)), 0)::text AS total
      FROM driver_finance.settlement_lines sl
      JOIN driver_finance.driver_settlements ds ON ds.id = sl.settlement_id
      WHERE sl.settlement_id = $2::uuid
        AND ds.operating_company_id = $1::uuid
        AND sl.line_type = 'abandonment_chargeback'
    `,
    [operatingCompanyId, settlementId]
  );
  return dollarsToCents(res.rows[0]?.total ?? 0);
}

/** Un-recovered outstanding advances for the driver (recovered_in_settlement_id IS NULL). Read-only + FOR UPDATE. */
async function loadRecoverableAdvances(
  client: DbClient,
  operatingCompanyId: string,
  driverId: string
): Promise<RecoverableAdvance[]> {
  const res = await client.query<{ id: string; display_id: string | null; amount: string; outstanding_balance: string }>(
    `
      SELECT id::text, display_id, amount::text, outstanding_balance::text
      FROM driver_finance.driver_advances
      WHERE operating_company_id = $1::uuid
        AND driver_id = $2::uuid
        AND recovered_in_settlement_id IS NULL
        AND status NOT IN ('void', 'cancelled', 'recovered')
      ORDER BY created_at ASC, id ASC
      FOR UPDATE
    `,
    [operatingCompanyId, driverId]
  );
  return res.rows
    .map((r) => {
      // Recover the outstanding balance if positive, else the original amount (advance not yet amortized).
      const outstanding = dollarsToCents(r.outstanding_balance);
      const amount = dollarsToCents(r.amount);
      const cents = outstanding > 0 ? outstanding : amount;
      return { id: r.id, display_id: r.display_id, amount_cents: cents };
    })
    .filter((a) => a.amount_cents > 0);
}

/**
 * Resolve + validate the chosen payment method (entity-scoped, active, non-void, gl_account_id set). The
 * net cash leg credits its gl_account_id. Records-only downstream — the method never moves money here.
 */
async function resolvePaymentMethod(
  client: DbClient,
  operatingCompanyId: string,
  paymentMethodId: string
): Promise<{ id: string; name: string; glAccountId: string }> {
  const res = await client.query<{ id: string; name: string; gl_account_id: string | null }>(
    `
      SELECT id::text, name, gl_account_id::text AS gl_account_id
      FROM catalogs.payment_methods
      WHERE id = $2::uuid AND operating_company_id = $1::uuid AND is_active AND voided_at IS NULL
      LIMIT 1
    `,
    [operatingCompanyId, paymentMethodId]
  );
  const row = res.rows[0];
  if (!row) {
    throw new SettlementPayRunError("PAYMENT_METHOD_INVALID", `Payment method ${paymentMethodId} not found / inactive for this entity`);
  }
  if (!row.gl_account_id) {
    throw new SettlementPayRunError(
      "PAYMENT_METHOD_NO_GL_ACCOUNT",
      `Payment method '${row.name}' has no gl_account_id set — cannot disburse a settlement via it`,
      { payment_method_id: row.id }
    );
  }
  return { id: row.id, name: row.name, glAccountId: row.gl_account_id };
}

/**
 * Preview OR close a driver settlement pay-run. Flag SETTLEMENT_GL_POSTING_ENABLED (default OFF) → PREVIEW
 * ONLY (computes the net + the balanced JE preview + records the disbursement metadata, but writes NO
 * journal entries and does NOT stamp advance recovery). With the flag ON → recovers advances (idempotent),
 * records the escrow contribution to the escrow ledger, posts the balanced JE through createJournalEntry,
 * and records the net disbursement (records-only). Entity-scoped, FORCED-RLS-compatible.
 */
export async function closeSettlementPayRun(
  input: {
    operatingCompanyId: string;
    settlementId: string;
    paymentMethodId?: string | null;
    /** Owner/entity policy contribution per settlement; falls back to the named default when unset. */
    standardEscrowContributionCents?: number | null;
    paymentReference?: string | null;
    /** Optional bank txn to link both-way (records-only; no money is moved). */
    bankTxnId?: string | null;
    /** Force PREVIEW (compute only, write nothing) even when the posting flag is ON. */
    previewOnly?: boolean;
  },
  actor: Actor
): Promise<SettlementPayRunResult> {
  const opco = input.operatingCompanyId;
  const settlementId = input.settlementId;

  const flagOn =
    input.previewOnly === true
      ? false
      : await scoped(actor, opco, (client) =>
          isEnabled(client as never, SETTLEMENT_GL_POSTING_FLAG_KEY, { operating_company_id: opco, user_uuid: actor.userId })
        );

  return scoped(actor, opco, async (client) => {
    const settlement = await loadSettlement(client, opco, settlementId);
    if (settlement.locked_at == null && !POSTABLE_STATUSES.has(settlement.status)) {
      throw new SettlementPayRunError(
        "SETTLEMENT_NOT_POSTABLE",
        `Settlement ${settlement.display_id ?? settlement.id} is not finalized/locked (status=${settlement.status})`
      );
    }

    // ── Compute each net term from a single authoritative source (no double counting). ────────────────
    const grossCents = dollarsToCents(settlement.gross_pay);
    const deductionsByRole = await loadOtherDeductionsByRole(client, opco, settlementId);
    const deductionsCents = Array.from(deductionsByRole.values()).reduce((s, v) => s + v, 0);
    const chargebacksCents = await loadChargebacksCents(client, opco, settlementId);

    const recoverable = await loadRecoverableAdvances(client, opco, settlement.driver_id);
    const advanceRecoveriesCents = recoverable.reduce((s, a) => s + a.amount_cents, 0);

    const escrowBalanceBeforeCents = await readDriverEscrowBalanceCents(client, opco, settlement.driver_id);
    const standardEscrow =
      input.standardEscrowContributionCents != null && input.standardEscrowContributionCents > 0
        ? Math.round(input.standardEscrowContributionCents)
        : DEFAULT_ESCROW_PER_SETTLEMENT_CONTRIBUTION_CENTS;
    const escrowContributionCents = computeCappedEscrowContributionCents({
      currentBalanceCents: escrowBalanceBeforeCents,
      standardPerSettlementContributionCents: standardEscrow,
    });

    const netCents =
      grossCents - deductionsCents - escrowContributionCents - advanceRecoveriesCents - chargebacksCents;

    const breakdown: PayRunNetBreakdown = {
      gross_cents: grossCents,
      deductions_cents: deductionsCents,
      chargebacks_cents: chargebacksCents,
      advance_recoveries_cents: advanceRecoveriesCents,
      escrow_contribution_cents: escrowContributionCents,
      escrow_balance_before_cents: escrowBalanceBeforeCents,
      net_cents: netCents,
    };

    if (netCents < 0) {
      throw new SettlementPayRunError(
        "NET_PAY_NEGATIVE",
        `Settlement ${settlement.display_id ?? settlementId} net would be negative (${netCents}c) — deductions/recoveries exceed gross`,
        breakdown as unknown as Record<string, unknown>
      );
    }

    const label = `Settlement ${settlement.display_id ?? settlement.id}`;

    // ── Resolve the credit target accounts (missing => STOP, never guess). ────────────────────────────
    const driverPayAccount = await resolveRoleBindingAccount(client, opco, "driver_pay_expense");
    if (!driverPayAccount) {
      throw new SettlementPayRunError("DRIVER_PAY_ACCOUNT_MISSING", "No active 'driver_pay_expense' role binding");
    }

    const legs: PayRunJeLegPreview[] = [
      { account_id: driverPayAccount, debit_or_credit: "debit", amount_cents: grossCents, description: `${label} — driver pay (gross)` },
    ];

    for (const [roleKey, cents] of deductionsByRole) {
      const acct = await resolveRoleBindingAccount(client, opco, roleKey);
      if (!acct) {
        throw new SettlementPayRunError(
          "DEDUCTION_RECOVERY_ACCOUNT_MISSING",
          `No active '${roleKey}' role binding for a settlement deduction bucket`,
          { role_key: roleKey }
        );
      }
      legs.push({ account_id: acct, debit_or_credit: "credit", amount_cents: cents, description: `${label} — ${roleKey} recovery` });
    }

    if (chargebacksCents > 0) {
      const cbAcct = await resolveRoleBindingAccount(client, opco, "abandonment_chargeback_recovery");
      if (!cbAcct) {
        throw new SettlementPayRunError(
          "CHARGEBACK_RECOVERY_ACCOUNT_MISSING",
          "No active 'abandonment_chargeback_recovery' role binding for settlement chargebacks"
        );
      }
      legs.push({ account_id: cbAcct, debit_or_credit: "credit", amount_cents: chargebacksCents, description: `${label} — abandonment chargeback recovery` });
    }

    if (advanceRecoveriesCents > 0) {
      // Cr cash-advance CLEARING (the advance_recovery role account) — reduces the driver-advance receivable.
      const advAcct = await resolveRoleBindingAccount(client, opco, "advance_recovery");
      if (!advAcct) {
        throw new SettlementPayRunError(
          "ADVANCE_CLEARING_ACCOUNT_MISSING",
          "No active 'advance_recovery' (cash-advance clearing) role binding for advance recoveries"
        );
      }
      legs.push({ account_id: advAcct, debit_or_credit: "credit", amount_cents: advanceRecoveriesCents, description: `${label} — cash-advance recovery` });
    }

    if (escrowContributionCents > 0) {
      // Cr the driver's OWN Damage-Claim escrow LIABILITY sub-account (I3; fail-loud Liability + not-Faro).
      const escrow = await resolveDriverEscrowLiabilityAccount(client, opco, settlement.driver_id);
      legs.push({
        account_id: escrow.accountId,
        debit_or_credit: "credit",
        amount_cents: escrowContributionCents,
        description: `${label} — escrow contribution (capped @ $2,000)`,
      });
    }

    // ── Net cash disbursement leg (chosen payment method's gl_account_id). Records-only downstream. ────
    let paymentMethod: { id: string; name: string; glAccountId: string } | null = null;
    if (netCents > 0) {
      if (!input.paymentMethodId) {
        throw new SettlementPayRunError(
          "PAYMENT_METHOD_INVALID",
          `Settlement ${settlement.display_id ?? settlementId} has net pay ${netCents}c but no payment method chosen for disbursement`
        );
      }
      paymentMethod = await resolvePaymentMethod(client, opco, input.paymentMethodId);
      legs.push({
        account_id: paymentMethod.glAccountId,
        debit_or_credit: "credit",
        amount_cents: netCents,
        description: `${label} — net driver pay via ${paymentMethod.name}`,
      });
    } else if (input.paymentMethodId) {
      // No cash to disburse (fully absorbed by deductions/recoveries) but a method was chosen → validate it.
      paymentMethod = await resolvePaymentMethod(client, opco, input.paymentMethodId);
    }

    // Assert the preview balances (debits == credits) up front — mirrors createJournalEntry's guard.
    const debitTotal = legs.filter((l) => l.debit_or_credit === "debit").reduce((s, l) => s + l.amount_cents, 0);
    const creditTotal = legs.filter((l) => l.debit_or_credit === "credit").reduce((s, l) => s + l.amount_cents, 0);
    if (debitTotal !== creditTotal || debitTotal <= 0) {
      throw new SettlementPayRunError(
        "UNBALANCED_ENTRY",
        `Pay-run JE preview does not balance (debits=${debitTotal}, credits=${creditTotal})`,
        { debit_total: debitTotal, credit_total: creditTotal }
      );
    }

    // ── FLAG OFF → PREVIEW ONLY: return the computed net + balanced JE preview, write NOTHING. ─────────
    if (!flagOn) {
      return {
        result: "previewed" as const,
        posting_enabled: false,
        settlement_id: settlementId,
        journal_entry_id: null,
        breakdown,
        recovered_advance_ids: recoverable.map((a) => a.id),
        je_preview: legs,
        disbursement: { recorded: false, payment_method_id: paymentMethod?.id ?? null, payment_method_name: paymentMethod?.name ?? null },
      };
    }

    // ── FLAG ON → POST. Idempotent advance recovery + escrow-ledger hold + balanced JE + disbursement. ─
    const recoveredIds: string[] = [];
    for (const adv of recoverable) {
      const upd = await client.query(
        `
          UPDATE driver_finance.driver_advances
             SET recovered_in_settlement_id = $2::uuid, status = 'recovered', outstanding_balance = 0, updated_at = now()
           WHERE id = $1::uuid AND operating_company_id = $3::uuid
             AND recovered_in_settlement_id IS NULL      -- IDEMPOTENT: never double-recover
        `,
        [adv.id, settlementId, opco]
      );
      if ((upd.rowCount ?? 0) > 0) recoveredIds.push(adv.id);
    }

    // Escrow contribution → escrow ledger 'hold' + refreshed running balance (never a release). Best-effort
    // upsert of the per-driver escrow_balances summary so the next pay-run reads the new running balance.
    if (escrowContributionCents > 0) {
      await recordEscrowContribution(client, {
        operatingCompanyId: opco,
        driverId: settlement.driver_id,
        settlementId,
        amountCents: escrowContributionCents,
        balanceBeforeCents: escrowBalanceBeforeCents,
        label,
      });
    }

    const je = await createJournalEntry(
      {
        operating_company_id: opco,
        entry_date: settlement.period_end,
        memo: `${label} — pay-run close (net ${netCents}c)`,
        source: "auto",
        postings: legs.map((l) => ({ account_id: l.account_id, debit_or_credit: l.debit_or_credit, amount_cents: l.amount_cents, description: l.description })),
      },
      { userId: actor.userId, role: "system" }
    );

    // Records-only disbursement: stamp the chosen method + reference + both-way bank-txn link. No money moves.
    let disbursementRecorded = false;
    if (paymentMethod) {
      disbursementRecorded = await recordSettlementDisbursement(client, {
        operatingCompanyId: opco,
        settlementId,
        paymentMethodName: paymentMethod.name,
        paymentReference: input.paymentReference ?? null,
        bankTxnId: input.bankTxnId ?? null,
      });
    }

    await appendCrudAudit(
      client as never,
      actor.userId,
      "driver_finance.settlement.payrun_closed",
      {
        resource_type: "driver_finance.driver_settlements",
        resource_id: settlementId,
        operating_company_id: opco,
        driver_id: settlement.driver_id,
        journal_entry_id: je.id,
        ...breakdown,
        recovered_advance_ids: recoveredIds,
        payment_method_id: paymentMethod?.id ?? null,
      },
      "info",
      "SETTLEMENT-PAYRUN-CLOSE"
    );

    return {
      result: "posted" as const,
      posting_enabled: true,
      settlement_id: settlementId,
      journal_entry_id: je.id,
      breakdown,
      recovered_advance_ids: recoveredIds,
      je_preview: legs,
      disbursement: { recorded: disbursementRecorded, payment_method_id: paymentMethod?.id ?? null, payment_method_name: paymentMethod?.name ?? null },
    };
  });
}

/** Record the escrow contribution to the per-driver ledger ('hold') + refresh the running-balance summary. */
async function recordEscrowContribution(
  client: DbClient,
  args: {
    operatingCompanyId: string;
    driverId: string;
    settlementId: string;
    amountCents: number;
    balanceBeforeCents: number;
    label: string;
  }
): Promise<void> {
  const newBalance = args.balanceBeforeCents + args.amountCents;
  // Upsert the running-balance summary (authoritative current balance for the next pay-run's cap check).
  // NOTE: escrow_balances.last_settlement_id / escrow_ledger.settlement_id still FK into the RETIRED
  // settlement.settlement family (the canonical-repoint migration 202607110220 is HELD, so it is absent on
  // a fresh CI DB). Writing a driver_finance.driver_settlements id there would FK-violate — so we OMIT the
  // settlement columns entirely (both are nullable). The settlement linkage is captured on the JE audit +
  // driver_advances.recovered_in_settlement_id + the ledger description.
  const bal = await client.query<{ id: string }>(
    `
      INSERT INTO driver_finance.escrow_balances
        (operating_company_id, driver_id, total_held_cents, current_balance_cents, last_updated_at)
      VALUES ($1::uuid, $2::uuid, $3, $4, now())
      ON CONFLICT (operating_company_id, driver_id) DO UPDATE SET
        total_held_cents = driver_finance.escrow_balances.total_held_cents + $3,
        current_balance_cents = driver_finance.escrow_balances.current_balance_cents + $3,
        last_updated_at = now()
      RETURNING id::text
    `,
    [args.operatingCompanyId, args.driverId, args.amountCents, newBalance]
  );
  const balanceId = bal.rows[0]?.id;
  if (!balanceId) return;
  // Append the ledger 'hold' entry (detailed history). running_balance_cents = the post-contribution balance.
  await client.query(
    `
      INSERT INTO driver_finance.escrow_ledger
        (operating_company_id, driver_id, escrow_balance_id, transaction_type, amount_cents, running_balance_cents, description)
      VALUES ($1::uuid, $2::uuid, $3::uuid, 'hold', $4, $5, $6)
    `,
    [args.operatingCompanyId, args.driverId, balanceId, args.amountCents, newBalance, `${args.label} — escrow contribution (capped @ $2,000)`]
  );
}

/**
 * Records-only disbursement (reuse point 5): TMS RECORDS how the net was paid (the chosen payment method,
 * a reference, and a both-way bank-txn link) but NEVER moves money. Stamps payment metadata on the
 * settlement; leaves payment_state untouched (the actual bank movement/reconciliation is a separate step).
 * Returns whether a row was stamped.
 */
async function recordSettlementDisbursement(
  client: DbClient,
  args: {
    operatingCompanyId: string;
    settlementId: string;
    paymentMethodName: string;
    paymentReference: string | null;
    bankTxnId: string | null;
  }
): Promise<boolean> {
  const upd = await client.query(
    `
      UPDATE driver_finance.driver_settlements
         SET payment_method = $3,
             payment_bank_reference = COALESCE($4, payment_bank_reference),
             paid_via_bank_txn_id = COALESCE($5::uuid, paid_via_bank_txn_id),
             updated_at = now()
       WHERE id = $1::uuid AND operating_company_id = $2::uuid
    `,
    [args.operatingCompanyId, args.settlementId, args.paymentMethodName, args.paymentReference, args.bankTxnId]
  );
  return (upd.rowCount ?? 0) > 0;
}
