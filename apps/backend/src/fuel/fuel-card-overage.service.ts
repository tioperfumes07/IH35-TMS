/**
 * BANK-DOM-06 — fuel-card OVERAGE -> driver receivable -> settlement deduction.
 *
 * ROOT CAUSE this closes: a fleet-card purchase over the company's authorized limit — or a non-fuel
 * item bought on the card — was paid in full by the company with NO recovery path. There was no
 * policy, no receivable and no deduction anywhere in the codebase, so every over-limit and personal
 * charge was silently absorbed by the company.
 *
 * NO NEW GL MATH. This writes NO debit, NO credit and NO journal entry. It reuses the EXACT canonical
 * hop BLOCK-6b already uses for a fine the company paid on a driver's behalf:
 *
 *   computeFuelCardOverageCents (pure, owner-policy driven)
 *     -> createSettlementDeduction(deduction_type='fuel')   [driver receivable subledger]
 *        -> FIN-18 settlement poster credits `fuel_advance_recovery` when the settlement posts
 *
 * The full card amount continues to post as fuel expense through the existing fuel poster
 * (postFuelExpenseFromEvent) — correct, because the company really did pay it. The driver-owed
 * portion is recovered as a settlement deduction, exactly like the existing fine/toll/citation
 * recover-from-driver buckets.
 *
 * FLAG: FUEL_CARD_OVERAGE_RECOVERY_ENABLED. Per-entity override only; DEFAULT OFF. When OFF this is a
 * strict no-op. Even when ON, a company with no owner-designated policy row is still a no-op.
 *
 * Must run AFTER the ingest transaction that wrote fuel.fuel_transactions has committed (same
 * contract as flushFuelGlPostsAfterCommit, and for the same reason: the deduction FKs the fuel row).
 */
import { withLuciaBypass } from "../auth/db.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { createSettlementDeduction, type Queryable } from "../driver-finance/deductions.service.js";
import {
  buildOverageReason,
  computeFuelCardOverageCents,
  type FuelCardOveragePolicy,
} from "./fuel-card-overage.math.js";
import type { FuelTxnGlPostCandidate } from "../accounting/fuel-posting/maybe-post-from-fuel-transaction.service.js";

export const FUEL_CARD_OVERAGE_FLAG_KEY = "FUEL_CARD_OVERAGE_RECOVERY_ENABLED";

const SYSTEM_ACTOR_USER_ID =
  process.env.SYSTEM_ACTOR_USER_ID ?? "00000000-0000-4000-8000-000000000001";

export type FuelOverageRecoveryResult =
  | { status: "skipped_flag_off" }
  | { status: "skipped_no_policy" }
  | { status: "skipped_no_driver" }
  | { status: "skipped_no_overage" }
  | { status: "already_recovered"; deduction_id: string }
  | { status: "recovered"; deduction_id: string; overage_cents: number }
  | { status: "error"; message: string };

type DbClient = {
  query: <T = Record<string, unknown>>(
    sql: string,
    values?: unknown[]
  ) => Promise<{ rows: T[]; rowCount?: number }>;
};

/**
 * Owner's ACTIVE policy: the per-driver override wins over the company default.
 * Returns null when the owner has designated nothing (the overwhelmingly common case today).
 */
export async function resolveOveragePolicy(
  client: DbClient,
  operatingCompanyId: string,
  driverId: string | null
): Promise<FuelCardOveragePolicy | null> {
  const exists = await client.query<{ ok: boolean }>(
    `SELECT to_regclass('fuel.fuel_card_overage_policies') IS NOT NULL AS ok`
  );
  if (!exists.rows[0]?.ok) return null;

  const res = await client.query<{
    per_transaction_limit_cents: string | null;
    recover_non_fuel_purchases: boolean;
  }>(
    `
      SELECT per_transaction_limit_cents::text, recover_non_fuel_purchases
      FROM fuel.fuel_card_overage_policies
      WHERE operating_company_id = $1::uuid
        AND is_active
        AND effective_from <= CURRENT_DATE
        AND (driver_id = $2::uuid OR driver_id IS NULL)
      -- Per-driver override first; company default second.
      ORDER BY (driver_id IS NOT NULL) DESC, effective_from DESC
      LIMIT 1
    `,
    [operatingCompanyId, driverId]
  );

  const row = res.rows[0];
  if (!row) return null;
  return {
    per_transaction_limit_cents:
      row.per_transaction_limit_cents === null ? null : Number(row.per_transaction_limit_cents),
    recover_non_fuel_purchases: Boolean(row.recover_non_fuel_purchases),
  };
}

/**
 * Flag-gated, idempotent overage recovery for ONE canonical fuel transaction.
 * Safe to call repeatedly: the partial UNIQUE index on
 * (operating_company_id, source_fuel_transaction_id) makes a double-charge impossible at the DB
 * level, and the pre-check below turns the second call into a clean `already_recovered`.
 */
export async function maybeRecoverFuelCardOverage(
  candidate: FuelTxnGlPostCandidate
): Promise<FuelOverageRecoveryResult> {
  // A card charge can only be recovered from a driver we actually matched. An unmatched driver is a
  // linkage gap, never a licence to charge someone arbitrary.
  if (!candidate.driver_id) return { status: "skipped_no_driver" };
  if (!candidate.fuel_transaction_id) return { status: "skipped_no_driver" };

  const actorUserId = (candidate.actor_user_id?.trim() || SYSTEM_ACTOR_USER_ID).toLowerCase();

  try {
    return await withLuciaBypass(async (rawClient) => {
      const client = rawClient as unknown as DbClient;
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [
        candidate.operating_company_id,
      ]);

      const flagOn = await isEnabled(client, FUEL_CARD_OVERAGE_FLAG_KEY, {
        operating_company_id: candidate.operating_company_id,
        user_uuid: actorUserId,
      });
      if (!flagOn) return { status: "skipped_flag_off" } as const;

      const policy = await resolveOveragePolicy(
        client,
        candidate.operating_company_id,
        candidate.driver_id ?? null
      );
      if (!policy) return { status: "skipped_no_policy" } as const;

      const totalCents = Math.round(Number(candidate.amount_cents ?? 0));
      const overage = computeFuelCardOverageCents({
        total_cents: totalCents,
        fuel_type: candidate.fuel_type,
        policy,
      });
      if (overage.overage_cents <= 0) return { status: "skipped_no_overage" } as const;

      // Idempotency pre-check (the UNIQUE index is the hard backstop).
      const existing = await client.query<{ id: string }>(
        `
          SELECT id::text
          FROM driver_finance.driver_settlement_deductions
          WHERE operating_company_id = $1::uuid
            AND source_fuel_transaction_id = $2::uuid
          LIMIT 1
        `,
        [candidate.operating_company_id, candidate.fuel_transaction_id]
      );
      if (existing.rows[0]?.id) {
        return { status: "already_recovered", deduction_id: existing.rows[0].id } as const;
      }

      // REUSE the canonical deduction writer — no new receivable table, no new GL math.
      const deduction = await createSettlementDeduction(client as unknown as Queryable, {
        driverId: candidate.driver_id as string,
        operatingCompanyId: candidate.operating_company_id,
        amountCents: overage.overage_cents,
        reason: buildOverageReason(overage, policy, totalCents),
        sourceType: "fuel",
        sourceFuelTransactionId: candidate.fuel_transaction_id,
        createdByUserId: actorUserId,
      });

      // Reverse drill-through (Rule 14): the fuel transaction points back at its deduction.
      await client.query(
        `
          UPDATE fuel.fuel_transactions
             SET overage_deduction_id = $1::uuid,
                 overage_recovered_cents = $2::bigint,
                 updated_at = now()
           WHERE id = $3::uuid
             AND operating_company_id = $4::uuid
        `,
        [
          deduction.id,
          overage.overage_cents,
          candidate.fuel_transaction_id,
          candidate.operating_company_id,
        ]
      );

      return {
        status: "recovered",
        deduction_id: deduction.id,
        overage_cents: overage.overage_cents,
      } as const;
    });
  } catch (err) {
    return { status: "error", message: String((err as Error)?.message ?? err) };
  }
}

/**
 * Best-effort flush after ingest commit — never throws; never blocks ingest success.
 * Mirrors flushFuelGlPostsAfterCommit and consumes the SAME candidate list, so both fuel writers
 * (CSV import + Relay cron) get the overage path with no duplicated resolution logic.
 */
export async function flushFuelCardOverageAfterCommit(
  candidates: FuelTxnGlPostCandidate[],
  log?: { warn?: (obj: unknown, msg?: string) => void; info?: (obj: unknown, msg?: string) => void }
): Promise<{
  attempted: number;
  recovered: number;
  recovered_cents: number;
  skipped_flag_off: number;
  errors: number;
}> {
  const stats = { attempted: 0, recovered: 0, recovered_cents: 0, skipped_flag_off: 0, errors: 0 };
  for (const candidate of candidates) {
    if (!candidate.fuel_transaction_id) continue;
    stats.attempted += 1;
    const result = await maybeRecoverFuelCardOverage(candidate);
    if (result.status === "recovered") {
      stats.recovered += 1;
      stats.recovered_cents += result.overage_cents;
    } else if (result.status === "skipped_flag_off") {
      stats.skipped_flag_off += 1;
    } else if (result.status === "error") {
      stats.errors += 1;
      log?.warn?.(
        {
          operating_company_id: candidate.operating_company_id,
          fuel_transaction_id: candidate.fuel_transaction_id,
          error: result.message,
        },
        "[FUEL_CARD_OVERAGE] recovery failed (ingest already committed)"
      );
    }
  }
  if (stats.recovered > 0) {
    log?.info?.(stats, "[FUEL_CARD_OVERAGE] flush complete");
  }
  return stats;
}
