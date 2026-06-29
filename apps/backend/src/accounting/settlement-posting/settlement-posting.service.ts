// FIN-18 — Settlement + deduction GL posting engine (TIER-1 FINANCIAL; BUILD-AND-HOLD, flag OFF).
//
// On a finalized/locked driver settlement (TRANSP only — never cross-post), post ONE balanced journal
// entry through the established accounting spine (NO new GL math, NO ad-hoc poster):
//   Dr  driver-pay expense        = gross_pay
//   Dr  reimbursement expense     = reimbursements_total            (only when > 0)
//   Cr  <each deduction bucket>   = its amount_cents -> the bucket's role-mapped RECOVERY account
//   Cr  net-pay CLEARING          = net_pay                         (B4 locked = CLEARING, not liability)
// The later bank payout posts Dr net-pay clearing / Cr bank (out of FIN-18 scope).
//
// OWNER-LOCKED RULES (Jorge 2026-06-29):
//   - Consent gate (FLSA): a deduction posts ONLY if hasSignedDeductionAuthorization(driver) is true,
//     else BLOCK + surface (never silently drop).
//   - Net-pay floor: driver retains >= a carrier-configurable % of GROSS (default 10%, per entity with
//     a per-driver override; W-2 applies the STRICTER of the policy floor + the FLSA floor). A breach
//     BLOCKS the post + surfaces which bucket / how much over — NEVER silently caps/spreads. An owner
//     may pass an explicit authorized override (actor + reason) recorded in the audit spine.
//   - Deductions are BUCKETED (separate recovery account + running balance per type) and per-event
//     owner-decided amounts (the amount_cents on each row is the owner's input — no auto-amortize).
//   - On post, each deduction is APPLIED against its bucket ledger (decrement) in the SAME transaction.
//
// FLAG GATE: SETTLEMENT_GL_POSTING_ENABLED (default OFF) -> NO-OP, zero JEs / financial rows.

import { withCurrentUser } from "../../auth/db.js";
import { isEnabled } from "../../lib/feature-flags/service.js";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { hasSignedDeductionAuthorization } from "../../legal/signed-finance-handoff.service.js";
import { emitAccountingSpineEvent, writeTransactionSourceLink } from "../accounting-spine-emit.js";
import { postVoidReversal } from "../void.service.js";
import { applyDeductionToBucket, reverseDeductionFromBucket } from "./bucket-ledger.service.js";
import {
  SETTLEMENT_GL_POSTING_FLAG_KEY,
  SettlementPostingError,
  applicableFloorCents,
  assertBalanced,
  bucketRecoveryRoleKey,
  buildSettlementIdempotencyKey,
  dollarsToCents,
  normalizeFloorPct,
  type BalancedLine,
} from "./settlement-posting.math.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

type Actor = { userId: string };

/** Explicit owner-authorized floor override (recorded with actor + reason in the audit spine). */
type FloorOverride = { authorizedByUserId: string; reason: string };

type PostingLine = BalancedLine & {
  account_id: string;
  description: string;
  link_role: string;
  deduction_id?: string | null;
  bucket_id?: string | null;
  source_expense_id?: string | null;
};

export type SettlementPostingResult =
  | { result: "skipped_flag_off"; journal_entry_id: null; settlement_id: string }
  | { result: "already_posted"; journal_entry_id: string; settlement_id: string }
  | {
      result: "posted";
      journal_entry_id: string;
      settlement_id: string;
      idempotency_key: string;
      debit_total_cents: number;
      credit_total_cents: number;
      deduction_line_count: number;
      floor_overridden: boolean;
    };

const POSTABLE_STATUSES = new Set(["locked", "final", "closed", "paid"]);

type SettlementRow = {
  id: string;
  driver_id: string;
  display_id: string | null;
  status: string;
  locked_at: string | null;
  period_end: string;
  gross_pay: string;
  deductions_total: string;
  reimbursements_total: string;
  net_pay: string;
};

type DeductionRow = {
  id: string;
  deduction_type: string;
  amount_cents: string;
  reason: string | null;
  bucket_id: string | null;
  source_expense_id: string | null;
};

async function loadSettlement(client: DbClient, operatingCompanyId: string, settlementId: string): Promise<SettlementRow> {
  const res = await client.query<SettlementRow>(
    `
      SELECT id::text, driver_id::text, display_id, status, locked_at::text, period_end::text,
             gross_pay::text, deductions_total::text, reimbursements_total::text, net_pay::text
      FROM driver_finance.driver_settlements
      WHERE operating_company_id = $1::uuid AND id = $2::uuid
      LIMIT 1
      FOR UPDATE
    `,
    [operatingCompanyId, settlementId]
  );
  const row = res.rows[0];
  if (!row) throw new SettlementPostingError("SETTLEMENT_NOT_FOUND", `Settlement ${settlementId} not found`);
  return row;
}

async function loadDeductions(client: DbClient, operatingCompanyId: string, settlementId: string): Promise<DeductionRow[]> {
  const res = await client.query<DeductionRow>(
    `
      SELECT id::text, deduction_type, amount_cents::text, reason, bucket_id::text, source_expense_id::text
      FROM driver_finance.driver_settlement_deductions
      WHERE operating_company_id = $1::uuid AND applied_to_settlement_id = $2::uuid
      ORDER BY created_at ASC, id ASC
      FOR UPDATE
    `,
    [operatingCompanyId, settlementId]
  );
  return res.rows;
}

/** Resolve an account by role_key from the GLOBAL catalogs.account_role_bindings registry. NULL when unmapped. */
async function resolveRoleAccountByKey(client: DbClient, roleKey: string): Promise<string | null> {
  const res = await client.query<{ account_id: string }>(
    `
      SELECT arb.account_id::text AS account_id
      FROM catalogs.account_role_bindings arb
      JOIN catalogs.accounts a ON a.id = arb.account_id
      WHERE arb.role_key = $1
        AND arb.deactivated_at IS NULL
        AND a.deactivated_at IS NULL
        AND a.is_postable = true
      LIMIT 1
    `,
    [roleKey]
  );
  return res.rows[0]?.account_id ?? null;
}

async function resolveDriverFloor(
  client: DbClient,
  operatingCompanyId: string,
  driverId: string
): Promise<{ floorPct: number; workerClass: string; flsaFloorCents: number | null }> {
  const driverRes = await client.query<{
    net_pay_floor_pct: string | null;
    worker_class: string;
    flsa_min_wage_cents_per_hour: string | null;
  }>(
    `SELECT net_pay_floor_pct::text, worker_class, flsa_min_wage_cents_per_hour::text
       FROM driver_finance.driver_pay_settings
      WHERE operating_company_id = $1::uuid AND driver_id = $2::uuid LIMIT 1`,
    [operatingCompanyId, driverId]
  );
  const entityRes = await client.query<{ net_pay_floor_pct: string | null; default_worker_classification: string | null }>(
    `SELECT net_pay_floor_pct::text, default_worker_classification
       FROM accounting.settlement_posting_config WHERE operating_company_id = $1::uuid LIMIT 1`,
    [operatingCompanyId]
  );
  const driver = driverRes.rows[0];
  const entity = entityRes.rows[0];
  const floorRaw = driver?.net_pay_floor_pct ?? entity?.net_pay_floor_pct ?? null;
  const workerClass = driver?.worker_class ?? entity?.default_worker_classification ?? "1099";
  // FLSA floor needs hours worked (not on the settlement header today) — structural hook; null => policy floor.
  return { floorPct: normalizeFloorPct(floorRaw), workerClass, flsaFloorCents: null };
}

async function findExistingPostedJe(client: DbClient, operatingCompanyId: string, idempotencyKey: string): Promise<string | null> {
  const res = await client.query<{ journal_entry_uuid: string }>(
    `
      SELECT journal_entry_uuid::text
      FROM accounting.journal_entry_postings
      WHERE operating_company_id = $1::uuid AND idempotency_key = $2
      ORDER BY line_sequence ASC
      LIMIT 1
    `,
    [operatingCompanyId, idempotencyKey]
  );
  return res.rows[0]?.journal_entry_uuid ?? null;
}

/**
 * Post a finalized/locked driver settlement to the GL. Flag-gated (OFF => no-op). Enforces the FLSA
 * consent gate + the net-pay floor (block, never cap/spread). Applies each bucketed deduction against
 * its ledger, all on one transaction. Reuses the accounting spine end-to-end, fail-loud.
 */
export async function postSettlementToGl(
  input: { operatingCompanyId: string; settlementId: string; floorOverride?: FloorOverride | null },
  actor: Actor
): Promise<SettlementPostingResult> {
  return withCurrentUser(actor.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operatingCompanyId]);

    // FLAG GATE — OFF => ZERO writes. Checked BEFORE any read/lock/insert.
    const flagOn = await isEnabled(client as never, SETTLEMENT_GL_POSTING_FLAG_KEY, {
      operating_company_id: input.operatingCompanyId,
      user_uuid: actor.userId,
    });
    if (!flagOn) {
      return { result: "skipped_flag_off", journal_entry_id: null, settlement_id: input.settlementId };
    }

    const idempotencyKey = buildSettlementIdempotencyKey(input.operatingCompanyId, input.settlementId, "initial_post");
    const existing = await findExistingPostedJe(client, input.operatingCompanyId, idempotencyKey);
    if (existing) return { result: "already_posted", journal_entry_id: existing, settlement_id: input.settlementId };

    const settlement = await loadSettlement(client, input.operatingCompanyId, input.settlementId);
    if (settlement.locked_at == null && !POSTABLE_STATUSES.has(settlement.status)) {
      throw new SettlementPostingError(
        "SETTLEMENT_NOT_POSTABLE",
        `Settlement ${settlement.display_id ?? settlement.id} is not finalized/locked (status=${settlement.status})`
      );
    }

    const deductions = await loadDeductions(client, input.operatingCompanyId, input.settlementId);

    const grossCents = dollarsToCents(settlement.gross_pay);
    const reimbCents = dollarsToCents(settlement.reimbursements_total);
    const netCents = dollarsToCents(settlement.net_pay);
    const headerDeductionCents = dollarsToCents(settlement.deductions_total);
    const rowsDeductionCents = deductions.reduce((s, d) => s + Number(d.amount_cents), 0);

    // The itemized BUCKETED rows are authoritative; a header/rows mismatch fails loud (no silent post).
    if (rowsDeductionCents !== headerDeductionCents) {
      throw new SettlementPostingError(
        "SETTLEMENT_TOTALS_INCONSISTENT",
        `deductions_total (${headerDeductionCents}c) != SUM(deduction rows) (${rowsDeductionCents}c)`,
        { header_deductions_cents: headerDeductionCents, rows_deductions_cents: rowsDeductionCents }
      );
    }

    // CONSENT GATE (FLSA) — required only when there ARE deductions. Block, never silently drop.
    if (deductions.length > 0) {
      const consented = await hasSignedDeductionAuthorization(client as never, {
        operatingCompanyId: input.operatingCompanyId,
        driverId: settlement.driver_id,
      });
      if (!consented) {
        throw new SettlementPostingError(
          "CONSENT_MISSING",
          `No signed deduction authorization on file for driver ${settlement.driver_id} — cannot post ${deductions.length} deduction(s)`,
          { driver_id: settlement.driver_id, deduction_count: deductions.length }
        );
      }
    }

    // NET-PAY FLOOR — block (or honor an explicit owner override) if deductions breach the floor.
    const { floorPct, workerClass, flsaFloorCents } = await resolveDriverFloor(client, input.operatingCompanyId, settlement.driver_id);
    const floorCents = applicableFloorCents({ grossCents, floorPct, workerClass, flsaFloorCents });
    const netAfterDeductions = grossCents - rowsDeductionCents;
    let floorOverridden = false;
    if (rowsDeductionCents > 0 && netAfterDeductions < floorCents) {
      if (!input.floorOverride || !input.floorOverride.reason?.trim()) {
        throw new SettlementPostingError(
          "NET_PAY_FLOOR_BREACH",
          `Deductions ${rowsDeductionCents}c drop net to ${netAfterDeductions}c, below the ${(floorPct * 100).toFixed(2)}% floor (${floorCents}c) of gross ${grossCents}c`,
          {
            gross_cents: grossCents,
            deductions_cents: rowsDeductionCents,
            net_after_deductions_cents: netAfterDeductions,
            floor_pct: floorPct,
            floor_cents: floorCents,
            over_by_cents: floorCents - netAfterDeductions,
            worker_class: workerClass,
          }
        );
      }
      floorOverridden = true;
    }

    // --- Resolve role accounts (by role_key; missing => STOP, never guess) ---
    const driverPayAccount = await resolveRoleAccountByKey(client, "driver_pay_expense");
    if (!driverPayAccount) {
      throw new SettlementPostingError("ACCOUNT_ROLE_BINDING_MISSING", "No active 'driver_pay_expense' role binding", {
        role_key: "driver_pay_expense",
      });
    }
    const netPayClearingAccount = await resolveRoleAccountByKey(client, "driver_payroll_clearing");
    if (!netPayClearingAccount) {
      throw new SettlementPostingError("ACCOUNT_ROLE_BINDING_MISSING", "No active 'driver_payroll_clearing' (net-pay clearing) role binding", {
        role_key: "driver_payroll_clearing",
      });
    }

    const lines: PostingLine[] = [
      {
        account_id: driverPayAccount,
        debit_or_credit: "debit",
        amount_cents: grossCents,
        description: `Settlement ${settlement.display_id ?? settlement.id} driver pay`,
        link_role: "settlement",
      },
    ];

    if (reimbCents > 0) {
      const reimbAccount = await resolveRoleAccountByKey(client, "reimbursement_expense");
      if (!reimbAccount) {
        throw new SettlementPostingError("ACCOUNT_ROLE_BINDING_MISSING", "No active 'reimbursement_expense' role binding", {
          role_key: "reimbursement_expense",
        });
      }
      lines.push({
        account_id: reimbAccount,
        debit_or_credit: "debit",
        amount_cents: reimbCents,
        description: `Settlement ${settlement.display_id ?? settlement.id} reimbursements`,
        link_role: "settlement",
      });
    }

    for (const d of deductions) {
      const roleKey = bucketRecoveryRoleKey(d.deduction_type);
      const target = await resolveRoleAccountByKey(client, roleKey);
      if (!target) {
        throw new SettlementPostingError(
          "ACCOUNT_ROLE_BINDING_MISSING",
          `No active recovery role binding '${roleKey}' for deduction bucket '${d.deduction_type}'`,
          { role_key: roleKey, deduction_type: d.deduction_type, deduction_id: d.id }
        );
      }
      lines.push({
        account_id: target,
        debit_or_credit: "credit",
        amount_cents: Number(d.amount_cents),
        description: `Settlement ${settlement.display_id ?? settlement.id} deduction: ${d.deduction_type}`,
        link_role: "settlement_deduction",
        deduction_id: d.id,
        bucket_id: d.bucket_id,
        source_expense_id: d.source_expense_id,
      });
    }

    lines.push({
      account_id: netPayClearingAccount,
      debit_or_credit: "credit",
      amount_cents: netCents,
      description: `Settlement ${settlement.display_id ?? settlement.id} net pay (clearing)`,
      link_role: "settlement",
    });

    // Fail loud if the books don't balance (gross + reimb == deductions + net).
    assertBalanced(lines);

    // --- Insert the JE header + lines through the spine ---
    const headerRes = await client.query<{ id: string }>(
      `
        INSERT INTO accounting.journal_entries
          (operating_company_id, entry_date, memo, status, source, created_by_user_id, qbo_sync_pending, created_at, updated_at)
        VALUES ($1::uuid, $2::date, $3, 'posted', 'auto', $4::uuid, true, now(), now())
        RETURNING id::text
      `,
      [input.operatingCompanyId, settlement.period_end, `Driver settlement ${settlement.display_id ?? settlement.id} posting`, actor.userId]
    );
    const journalEntryId = headerRes.rows[0]?.id;
    if (!journalEntryId) throw new Error("settlement_journal_entry_insert_failed");

    let lineSequence = 1;
    for (const line of lines) {
      const insRes = await client.query<{ id: string }>(
        `
          INSERT INTO accounting.journal_entry_postings
            (operating_company_id, journal_entry_uuid, line_sequence, account_id, debit_or_credit,
             amount_cents, description, source_transaction_type, source_transaction_id, idempotency_key,
             created_at, updated_at)
          VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5, $6, $7, 'settlement', $8, $9, now(), now())
          ON CONFLICT (operating_company_id, idempotency_key, line_sequence)
            WHERE idempotency_key IS NOT NULL DO NOTHING
          RETURNING id::text
        `,
        [input.operatingCompanyId, journalEntryId, lineSequence, line.account_id, line.debit_or_credit, line.amount_cents, line.description, input.settlementId, idempotencyKey]
      );
      const postingId = insRes.rows[0]?.id;
      if (postingId) {
        // source settlement -> posting
        await writeTransactionSourceLink(client as never, {
          operating_company_id: input.operatingCompanyId,
          journal_entry_posting_id: postingId,
          linked_object_type: "driver_settlement",
          linked_object_id: input.settlementId,
          relationship_role: line.link_role,
        });
        if (line.deduction_id) {
          // deduction line -> its driver_settlement_deductions row
          await writeTransactionSourceLink(client as never, {
            operating_company_id: input.operatingCompanyId,
            journal_entry_posting_id: postingId,
            linked_object_type: "driver_settlement_deduction",
            linked_object_id: line.deduction_id,
            relationship_role: "settlement_deduction_source",
          });
          // deduction line -> its source expense (recover-from-driver provenance)
          if (line.source_expense_id) {
            await writeTransactionSourceLink(client as never, {
              operating_company_id: input.operatingCompanyId,
              journal_entry_posting_id: postingId,
              linked_object_type: "expense",
              linked_object_id: line.source_expense_id,
              relationship_role: "settlement_deduction_source_expense",
            });
          }
        }
      }
      lineSequence += 1;
    }

    // Apply each bucketed deduction against its ledger (decrement remaining) — same transaction.
    for (const d of deductions) {
      if (d.bucket_id) {
        await applyDeductionToBucket(client, {
          operatingCompanyId: input.operatingCompanyId,
          bucketId: d.bucket_id,
          amountCents: Number(d.amount_cents),
          settlementId: input.settlementId,
          deductionId: d.id,
          actorUserId: actor.userId,
        });
      }
      // Mark the deduction applied to this settlement.
      await client.query(
        `UPDATE driver_finance.driver_settlement_deductions
            SET status = 'applied', remaining_balance_cents = 0, updated_at = now()
          WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [d.id, input.operatingCompanyId]
      );
    }

    const debitTotal = lines.filter((l) => l.debit_or_credit === "debit").reduce((s, l) => s + l.amount_cents, 0);
    const creditTotal = lines.filter((l) => l.debit_or_credit === "credit").reduce((s, l) => s + l.amount_cents, 0);

    // Immutable audit (canonical sink — audit.audit_events). Atomic with the GL write.
    await appendCrudAudit(
      client as never,
      actor.userId,
      "accounting.settlement.posted",
      {
        resource_type: "driver_finance.driver_settlements",
        resource_id: input.settlementId,
        operating_company_id: input.operatingCompanyId,
        journal_entry_id: journalEntryId,
        driver_id: settlement.driver_id,
        gross_cents: grossCents,
        deductions_cents: rowsDeductionCents,
        reimbursements_cents: reimbCents,
        net_cents: netCents,
        deduction_line_count: deductions.length,
        floor_overridden: floorOverridden,
      },
      "info",
      "FIN-18-SETTLEMENT-GL"
    );

    // Explicit owner floor-override is recorded as its OWN audit event (actor + reason).
    if (floorOverridden && input.floorOverride) {
      await appendCrudAudit(
        client as never,
        actor.userId,
        "accounting.settlement.floor_override",
        {
          resource_type: "driver_finance.driver_settlements",
          resource_id: input.settlementId,
          operating_company_id: input.operatingCompanyId,
          authorized_by_user_id: input.floorOverride.authorizedByUserId,
          reason: input.floorOverride.reason,
          floor_cents: floorCents,
          net_after_deductions_cents: netAfterDeductions,
        },
        "warning",
        "FIN-18-SETTLEMENT-GL"
      );
    }

    // Per-batch event for downstream pickup. subject_type='driver' is within the event_log allowlist;
    // 'settlement.posted' matches ^[a-z]+\.[a-z_]+$. Reuses the spine emitter (appended union member).
    await emitAccountingSpineEvent(client as never, {
      operating_company_id: input.operatingCompanyId,
      actor_user_id: actor.userId,
      event_type: "settlement.posted",
      entity_type: "driver",
      entity_id: settlement.driver_id,
      source_table: "driver_finance.driver_settlements",
      payload: { settlement_id: input.settlementId, journal_entry_id: journalEntryId, gross_cents: grossCents, net_cents: netCents, deductions_cents: rowsDeductionCents },
    });

    return {
      result: "posted",
      journal_entry_id: journalEntryId,
      settlement_id: input.settlementId,
      idempotency_key: idempotencyKey,
      debit_total_cents: debitTotal,
      credit_total_cents: creditTotal,
      deduction_line_count: deductions.length,
      floor_overridden: floorOverridden,
    };
  });
}

export type SettlementReversalResult = {
  result: "reversed" | "nothing_to_reverse";
  reversal_journal_entry_id: string | null;
  settlement_id: string;
};

/**
 * Reverse a posted settlement GL entry: post an equal-and-opposite reversing JE (NEVER delete), flip the
 * original JE to 'voided', and RESTORE each applied deduction's bucket balance. Reuses the void path.
 */
export async function reverseSettlementGlPosting(
  input: { operatingCompanyId: string; settlementId: string; reason: string },
  actor: Actor
): Promise<SettlementReversalResult> {
  return withCurrentUser(actor.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operatingCompanyId]);

    const idempotencyKey = buildSettlementIdempotencyKey(input.operatingCompanyId, input.settlementId, "initial_post");
    const jeId = await findExistingPostedJe(client, input.operatingCompanyId, idempotencyKey);
    if (!jeId) return { result: "nothing_to_reverse", reversal_journal_entry_id: null, settlement_id: input.settlementId };

    const header = await client.query<{ entry_date: string; status: string }>(
      `SELECT entry_date::text, status FROM accounting.journal_entries WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1 FOR UPDATE`,
      [jeId, input.operatingCompanyId]
    );
    const je = header.rows[0];
    if (!je || je.status === "voided") return { result: "nothing_to_reverse", reversal_journal_entry_id: null, settlement_id: input.settlementId };

    const reversal = await postVoidReversal(
      client as never,
      {
        operatingCompanyId: input.operatingCompanyId,
        entityType: "journal_entry",
        entityId: jeId,
        originalDate: je.entry_date,
        memo: `Void reversal of settlement ${input.settlementId} posting: ${input.reason}`,
      },
      { userId: actor.userId }
    );

    await client.query(
      `
        UPDATE accounting.journal_entries
        SET status = 'voided', voided_at = now(), voided_by_user_id = $3, void_reason = $4, qbo_sync_pending = true, updated_at = now()
        WHERE id = $1::uuid AND operating_company_id = $2::uuid
      `,
      [jeId, input.operatingCompanyId, actor.userId, input.reason]
    );

    // Restore each applied deduction's bucket balance.
    const deductions = await loadDeductions(client, input.operatingCompanyId, input.settlementId);
    for (const d of deductions) {
      if (d.bucket_id) {
        await reverseDeductionFromBucket(client, {
          operatingCompanyId: input.operatingCompanyId,
          bucketId: d.bucket_id,
          amountCents: Number(d.amount_cents),
          settlementId: input.settlementId,
          deductionId: d.id,
          actorUserId: actor.userId,
          reason: input.reason,
        });
      }
      await client.query(
        `UPDATE driver_finance.driver_settlement_deductions
            SET status = 'pending', remaining_balance_cents = amount_cents, updated_at = now()
          WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [d.id, input.operatingCompanyId]
      );
    }

    await appendCrudAudit(
      client as never,
      actor.userId,
      "accounting.settlement.reversed",
      {
        resource_type: "driver_finance.driver_settlements",
        resource_id: input.settlementId,
        operating_company_id: input.operatingCompanyId,
        journal_entry_id: jeId,
        reversal_journal_entry_id: reversal.reversal_journal_entry_id,
        void_reason: input.reason,
      },
      "warning",
      "FIN-18-SETTLEMENT-GL"
    );

    await emitAccountingSpineEvent(client as never, {
      operating_company_id: input.operatingCompanyId,
      actor_user_id: actor.userId,
      event_type: "settlement.reversed",
      entity_type: "driver",
      entity_id: (await loadSettlement(client, input.operatingCompanyId, input.settlementId)).driver_id,
      source_table: "driver_finance.driver_settlements",
      payload: { settlement_id: input.settlementId, journal_entry_id: jeId, reversal_journal_entry_id: reversal.reversal_journal_entry_id },
    });

    return { result: "reversed", reversal_journal_entry_id: reversal.reversal_journal_entry_id, settlement_id: input.settlementId };
  });
}
