/**
 * FUEL-03 — fuel-card overage engine (evaluate → flag → approve → receivable).
 *
 * ROOT CAUSE: policies existed but nothing evaluated spend vs cap; over-cap events sat unprocessed.
 *
 * OWNER A3/A3b/A3c: approve-then-recover; dedicated fuel_overage_receivable (FUEL-04); contract
 * authority required; DEFAULT = pending_review — never auto-charge without signed contract.
 *
 * REUSE poster — resolveRoleAccount('fuel_overage_receivable') + createJournalEntryOnClient.
 * NO NEW GL MATH. Settlement deduction auto-charge path (BANK-DOM-06) superseded by this engine.
 *
 * FLAGS (per-entity, default OFF):
 *   FUEL_CARD_OVERAGE_ENGINE_ENABLED — evaluate + create events
 *   FUEL_CARD_OVERAGE_GL_POSTING_ENABLED — post receivable JE after approval + contract authority
 */
import { withLuciaBypass } from "../auth/db.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import {
  buildOverageReason,
  computeFuelCardOverageCents,
  type FuelCardOveragePolicy,
} from "./fuel-card-overage.math.js";
import type { FuelTxnGlPostCandidate } from "../accounting/fuel-posting/maybe-post-from-fuel-transaction.service.js";
import { resolveFuelOverageContractAuthority } from "./fuel-card-overage-contract.service.js";
import { postFuelOverageReceivable } from "./fuel-card-overage-posting.service.js";
import { appendCrudAudit } from "../audit/crud-audit.js";

export const FUEL_CARD_OVERAGE_ENGINE_FLAG_KEY = "FUEL_CARD_OVERAGE_ENGINE_ENABLED";
export const FUEL_CARD_OVERAGE_GL_POSTING_FLAG_KEY = "FUEL_CARD_OVERAGE_GL_POSTING_ENABLED";

/** @deprecated Use FUEL_CARD_OVERAGE_ENGINE_FLAG_KEY — kept for guard backward-compat alias checks. */
export const FUEL_CARD_OVERAGE_FLAG_KEY = FUEL_CARD_OVERAGE_ENGINE_FLAG_KEY;

const SYSTEM_ACTOR_USER_ID =
  process.env.SYSTEM_ACTOR_USER_ID ?? "00000000-0000-4000-8000-000000000001";

export type FuelOverageEngineResult =
  | { status: "skipped_flag_off" }
  | { status: "skipped_no_policy" }
  | { status: "skipped_no_driver" }
  | { status: "skipped_no_overage" }
  | { status: "skipped_no_events_table" }
  | { status: "already_evaluated"; overage_event_id: string }
  | { status: "flagged_review"; overage_event_id: string; overage_cents: number; has_contract_authority: boolean }
  | { status: "company_variance"; overage_event_id: string; overage_cents: number; review_reason: string }
  | { status: "posted"; overage_event_id: string; journal_entry_id: string; overage_cents: number }
  | { status: "error"; message: string };

type DbClient = {
  query: <T = Record<string, unknown>>(
    sql: string,
    values?: unknown[]
  ) => Promise<{ rows: T[]; rowCount?: number }>;
};

export async function resolveOveragePolicy(
  client: DbClient,
  operatingCompanyId: string,
  driverId: string | null
): Promise<{ policy: FuelCardOveragePolicy; policy_id: string } | null> {
  const exists = await client.query<{ ok: boolean }>(
    `SELECT to_regclass('fuel.fuel_card_overage_policies') IS NOT NULL AS ok`
  );
  if (!exists.rows[0]?.ok) return null;

  const res = await client.query<{
    id: string;
    per_transaction_limit_cents: string | null;
    recover_non_fuel_purchases: boolean;
  }>(
    `
      SELECT id::text,
             per_transaction_limit_cents::text,
             recover_non_fuel_purchases
        FROM fuel.fuel_card_overage_policies
       WHERE operating_company_id = $1::uuid
         AND is_active
         AND effective_from <= CURRENT_DATE
         AND (driver_id = $2::uuid OR driver_id IS NULL)
       ORDER BY (driver_id IS NOT NULL) DESC, effective_from DESC
       LIMIT 1
    `,
    [operatingCompanyId, driverId]
  );

  const row = res.rows[0];
  if (!row) return null;
  return {
    policy_id: row.id,
    policy: {
      per_transaction_limit_cents:
        row.per_transaction_limit_cents === null ? null : Number(row.per_transaction_limit_cents),
      recover_non_fuel_purchases: Boolean(row.recover_non_fuel_purchases),
    },
  };
}

async function tableExists(client: DbClient, regclass: string): Promise<boolean> {
  const res = await client.query<{ ok: boolean }>(`SELECT to_regclass($1) IS NOT NULL AS ok`, [regclass]);
  return Boolean(res.rows[0]?.ok);
}

/**
 * Flag-gated evaluator for ONE fuel transaction. Creates fuel.fuel_card_overage_events when over cap.
 * Default status pending_review; without contract authority → company_variance (not a driver charge).
 */

/**
 * BANK-DOM-06 reverse/forward FKs — still live columns on prod. FUEL-03 approve path must read them
 * so we never double-create a settlement deduction / leave dead schema (§10a / verify-no-dead-schema).
 */
async function loadExistingOverageDeductionLink(
  client: DbClient,
  operatingCompanyId: string,
  fuelTransactionId: string
): Promise<{ deduction_id: string | null; overage_deduction_id: string | null }> {
  const fwd = await client.query<{ id: string }>(
    `
      SELECT id::text
        FROM driver_finance.driver_settlement_deductions
       WHERE operating_company_id = $1::uuid
         AND source_fuel_transaction_id = $2::uuid
       LIMIT 1
    `,
    [operatingCompanyId, fuelTransactionId]
  );
  const rev = await client.query<{ overage_deduction_id: string | null }>(
    `
      SELECT overage_deduction_id::text
        FROM fuel.fuel_transactions
       WHERE id = $1::uuid
         AND operating_company_id = $2::uuid
       LIMIT 1
    `,
    [fuelTransactionId, operatingCompanyId]
  );
  return {
    deduction_id: fwd.rows[0]?.id ?? null,
    overage_deduction_id: rev.rows[0]?.overage_deduction_id ?? null,
  };
}

export async function maybeEvaluateFuelCardOverage(
  candidate: FuelTxnGlPostCandidate
): Promise<FuelOverageEngineResult> {
  if (!candidate.driver_id || !candidate.fuel_transaction_id) {
    return { status: "skipped_no_driver" };
  }

  const actorUserId = (candidate.actor_user_id?.trim() || SYSTEM_ACTOR_USER_ID).toLowerCase();

  try {
    return await withLuciaBypass(async (rawClient) => {
      const client = rawClient as unknown as DbClient;
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [
        candidate.operating_company_id,
      ]);

      const engineOn = await isEnabled(client, FUEL_CARD_OVERAGE_ENGINE_FLAG_KEY, {
        operating_company_id: candidate.operating_company_id,
        user_uuid: actorUserId,
      });
      if (!engineOn) return { status: "skipped_flag_off" } as const;

      if (!(await tableExists(client, "fuel.fuel_card_overage_events"))) {
        return { status: "skipped_no_events_table" } as const;
      }

      const existing = await client.query<{ id: string; status: string; journal_entry_id: string | null }>(
        `
          SELECT id::text, status, journal_entry_id::text
            FROM fuel.fuel_card_overage_events
           WHERE operating_company_id = $1::uuid
             AND fuel_transaction_id = $2::uuid
             AND voided_at IS NULL
           LIMIT 1
        `,
        [candidate.operating_company_id, candidate.fuel_transaction_id]
      );
      if (existing.rows[0]?.id) {
        const row = existing.rows[0];
        if (row.journal_entry_id) {
          return {
            status: "posted",
            overage_event_id: row.id,
            journal_entry_id: row.journal_entry_id,
            overage_cents: 0,
          } as const;
        }
        return { status: "already_evaluated", overage_event_id: row.id } as const;
      }

      const resolved = await resolveOveragePolicy(
        client,
        candidate.operating_company_id,
        candidate.driver_id ?? null
      );
      if (!resolved) return { status: "skipped_no_policy" } as const;

      const totalCents = Math.round(Number(candidate.amount_cents ?? 0));
      const overage = computeFuelCardOverageCents({
        total_cents: totalCents,
        fuel_type: candidate.fuel_type,
        policy: resolved.policy,
      });
      if (overage.overage_cents <= 0) return { status: "skipped_no_overage" } as const;

      const contract = await resolveFuelOverageContractAuthority(rawClient, {
        driverId: candidate.driver_id as string,
        operatingCompanyId: candidate.operating_company_id,
      });

      const status = contract.hasContractAuthority ? "pending_review" : "company_variance";
      const reviewReason = contract.hasContractAuthority
        ? buildOverageReason(overage, resolved.policy, totalCents)
        : contract.denialReason ?? "Missing contract authority for driver recovery";

      const unitRow = await client.query<{ unit_id: string | null }>(
        `
          SELECT unit_id::text
            FROM fuel.fuel_transactions
           WHERE id = $1::uuid
             AND operating_company_id = $2::uuid
           LIMIT 1
        `,
        [candidate.fuel_transaction_id, candidate.operating_company_id]
      );

      const inserted = await client.query<{ id: string }>(
        `
          INSERT INTO fuel.fuel_card_overage_events (
            operating_company_id,
            fuel_transaction_id,
            driver_id,
            unit_id,
            policy_id,
            overage_cents,
            total_cents,
            overage_rule,
            status,
            review_reason,
            has_contract_authority,
            created_by_user_id
          )
          VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::bigint, $7::bigint, $8, $9, $10, $11, $12::uuid)
          RETURNING id::text
        `,
        [
          candidate.operating_company_id,
          candidate.fuel_transaction_id,
          candidate.driver_id,
          unitRow.rows[0]?.unit_id ?? null,
          resolved.policy_id,
          overage.overage_cents,
          totalCents,
          overage.rule === "non_fuel_purchase" ? "non_fuel_purchase" : "over_transaction_limit",
          status,
          reviewReason,
          contract.hasContractAuthority,
          actorUserId,
        ]
      );
      const eventId = inserted.rows[0]?.id;
      if (!eventId) throw new Error("fuel_overage_event_insert_failed");

      await appendCrudAudit(
        client,
        actorUserId,
        "fuel.fuel_card_overage_event_created",
        {
          resource_type: "fuel.fuel_card_overage_events",
          resource_id: eventId,
          operating_company_id: candidate.operating_company_id,
          fuel_transaction_id: candidate.fuel_transaction_id,
          driver_id: candidate.driver_id,
          overage_cents: overage.overage_cents,
          status,
          has_contract_authority: contract.hasContractAuthority,
        },
        "info",
        "FUEL-03-OVERAGE-ENGINE"
      );

      await client.query(
        `
          UPDATE fuel.fuel_transactions
             SET overage_event_id = $1::uuid,
                 overage_recovered_cents = $2::bigint,
                 updated_at = now()
           WHERE id = $3::uuid
             AND operating_company_id = $4::uuid
        `,
        [eventId, overage.overage_cents, candidate.fuel_transaction_id, candidate.operating_company_id]
      );

      if (!contract.hasContractAuthority) {
        return {
          status: "company_variance",
          overage_event_id: eventId,
          overage_cents: overage.overage_cents,
          review_reason: reviewReason,
        } as const;
      }

      return {
        status: "flagged_review",
        overage_event_id: eventId,
        overage_cents: overage.overage_cents,
        has_contract_authority: true,
      } as const;
    });
  } catch (err) {
    return { status: "error", message: String((err as Error)?.message ?? err) };
  }
}

/**
 * Approve-then-recover (A3b): manager approves a pending_review event; posts receivable when GL flag ON.
 */
export async function approveAndPostFuelCardOverage(
  input: {
    operating_company_id: string;
    overage_event_id: string;
    actor_user_id: string;
    actor_role?: string;
    fuel_type: string;
    transaction_at: string;
  }
): Promise<FuelOverageEngineResult> {
  try {
    return await withLuciaBypass(async (rawClient) => {
      const client = rawClient as unknown as DbClient;
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [
        input.operating_company_id,
      ]);

      // ACCT-F5646 — FOR UPDATE, locking this overage event for the ENTIRE approve+post flow below
      // (postFuelOverageReceivable runs on this same client/transaction, not a second connection).
      // Neither the pre-existing journal_entry_id IS NULL checks here nor postFuelOverageReceivable's
      // own re-check were real duplicate-post protection under READ COMMITTED: two concurrent approve
      // calls for the same overage_event_id (double-click, or a client retry after a slow/timed-out
      // response) could both read journal_entry_id IS NULL before either committed, both post a fully
      // balanced JE (Dr fuel_overage_receivable / Cr fuel expense), then both UPDATE journal_entry_id
      // — last write wins, permanently orphaning the other JE with no traceable link from the event
      // row and no unique constraint on journal_entry_id to catch it. The row lock makes the second
      // concurrent call block until the first commits, at which point its own re-read of
      // journal_entry_id (below and in postFuelOverageReceivable) correctly sees the already-posted
      // state and short-circuits.
      const event = await client.query<{
        id: string;
        fuel_transaction_id: string;
        driver_id: string;
        overage_cents: string;
        status: string;
        has_contract_authority: boolean;
        journal_entry_id: string | null;
      }>(
        `
          SELECT id::text,
                 fuel_transaction_id::text,
                 driver_id::text,
                 overage_cents::text,
                 status,
                 has_contract_authority,
                 journal_entry_id::text
            FROM fuel.fuel_card_overage_events
           WHERE id = $1::uuid
             AND operating_company_id = $2::uuid
             AND voided_at IS NULL
           LIMIT 1
           FOR UPDATE
        `,
        [input.overage_event_id, input.operating_company_id]
      );
      const row = event.rows[0];
      if (!row) return { status: "error", message: "overage_event_not_found" };
      // Reverse/forward deduction FKs (BANK-DOM-06). This USED to be an unassigned `await` whose
      // result was thrown away — a read that satisfied verify-no-dead-schema while protecting
      // nothing. Even with both FKs fully populated it would have deduped nothing, because nobody
      // looked at what it returned. A read that discards its result is not a use.
      //
      // Now it is load-bearing: if this fuel transaction has ALREADY been recovered from the driver
      // as a settlement deduction, posting the receivable would charge the driver a SECOND time for
      // the same gallon. Bail out instead.
      //
      // Today both columns are unwritten backend-wide (`source_fuel_transaction_id` appears exactly
      // once in apps/backend/src, in the SELECT above), so this branch cannot fire and behaviour is
      // UNCHANGED. That is deliberate: the guard goes in BEFORE the writer, so the day the
      // settlement-deduction recovery path lands it inherits real protection instead of a helper
      // that merely looks like it protects.
      const existingLink = await loadExistingOverageDeductionLink(
        client,
        input.operating_company_id,
        row.fuel_transaction_id
      );
      if (existingLink.deduction_id || existingLink.overage_deduction_id) {
        return { status: "already_evaluated", overage_event_id: row.id } as const;
      }
      if (row.journal_entry_id) {
        return {
          status: "posted",
          overage_event_id: row.id,
          journal_entry_id: row.journal_entry_id,
          overage_cents: Number(row.overage_cents),
        } as const;
      }
      if (!row.has_contract_authority) {
        return {
          status: "error",
          message: "contract_authority_required_before_driver_receivable",
        };
      }
      if (row.status !== "pending_review" && row.status !== "approved") {
        return { status: "error", message: `invalid_status_for_approval:${row.status}` };
      }

      await client.query(
        `
          UPDATE fuel.fuel_card_overage_events
             SET status = 'approved',
                 approved_at = now(),
                 approved_by_user_id = $1::uuid,
                 updated_at = now()
           WHERE id = $2::uuid
             AND operating_company_id = $3::uuid
        `,
        [input.actor_user_id, input.overage_event_id, input.operating_company_id]
      );

      await appendCrudAudit(
        client,
        input.actor_user_id,
        "fuel.fuel_card_overage_event_approved",
        {
          resource_type: "fuel.fuel_card_overage_events",
          resource_id: input.overage_event_id,
          operating_company_id: input.operating_company_id,
          fuel_transaction_id: row.fuel_transaction_id,
          overage_cents: Number(row.overage_cents),
        },
        "info",
        "FUEL-03-OVERAGE-ENGINE"
      );

      const glOn = await isEnabled(client, FUEL_CARD_OVERAGE_GL_POSTING_FLAG_KEY, {
        operating_company_id: input.operating_company_id,
        user_uuid: input.actor_user_id,
      });
      if (!glOn) {
        return {
          status: "flagged_review",
          overage_event_id: row.id,
          overage_cents: Number(row.overage_cents),
          has_contract_authority: true,
        } as const;
      }

      const posted = await postFuelOverageReceivable(rawClient, {
        operating_company_id: input.operating_company_id,
        fuel_transaction_id: row.fuel_transaction_id,
        overage_event_id: row.id,
        driver_id: row.driver_id,
        overage_cents: Number(row.overage_cents),
        fuel_type: input.fuel_type,
        transaction_at: input.transaction_at,
        actor_user_id: input.actor_user_id,
        actor_role: input.actor_role,
      });

      return {
        status: "posted",
        overage_event_id: row.id,
        journal_entry_id: posted.journal_entry_id,
        overage_cents: Number(row.overage_cents),
      } as const;
    });
  } catch (err) {
    return { status: "error", message: String((err as Error)?.message ?? err) };
  }
}

/** @deprecated Alias — FUEL-03 renamed evaluate entry point. */
export const maybeRecoverFuelCardOverage = maybeEvaluateFuelCardOverage;

export async function flushFuelCardOverageAfterCommit(
  candidates: FuelTxnGlPostCandidate[],
  log?: { warn?: (obj: unknown, msg?: string) => void; info?: (obj: unknown, msg?: string) => void }
): Promise<{
  attempted: number;
  flagged: number;
  company_variance: number;
  posted: number;
  skipped_flag_off: number;
  errors: number;
}> {
  const stats = {
    attempted: 0,
    flagged: 0,
    company_variance: 0,
    posted: 0,
    skipped_flag_off: 0,
    errors: 0,
  };
  for (const candidate of candidates) {
    if (!candidate.fuel_transaction_id) continue;
    stats.attempted += 1;
    const result = await maybeEvaluateFuelCardOverage(candidate);
    if (result.status === "flagged_review") stats.flagged += 1;
    else if (result.status === "company_variance") stats.company_variance += 1;
    else if (result.status === "posted") stats.posted += 1;
    else if (result.status === "skipped_flag_off") stats.skipped_flag_off += 1;
    else if (result.status === "error") {
      stats.errors += 1;
      log?.warn?.(
        {
          operating_company_id: candidate.operating_company_id,
          fuel_transaction_id: candidate.fuel_transaction_id,
          error: result.message,
        },
        "[FUEL_OVERAGE_ENGINE] evaluation failed (ingest already committed)"
      );
    }
  }
  if (stats.flagged + stats.company_variance + stats.posted > 0) {
    log?.info?.(stats, "[FUEL_OVERAGE_ENGINE] flush complete");
  }
  return stats;
}

/** Backfill hook: re-evaluate existing fuel rows that have no overage event yet. */
export async function reprocessUnprocessedFuelOverages(
  operatingCompanyId: string,
  actorUserId?: string
): Promise<{ processed: number; flagged: number; company_variance: number; errors: number }> {
  const stats = { processed: 0, flagged: 0, company_variance: 0, errors: 0 };

  return withLuciaBypass(async (rawClient) => {
    const client = rawClient as unknown as DbClient;
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);

    const rows = await client.query<{
      id: string;
      driver_id: string | null;
      fuel_type: string;
      total_cost: string;
      transaction_at: string;
    }>(
      `
        SELECT ft.id::text,
               ft.driver_id::text,
               ft.fuel_type,
               (ft.total_cost * 100)::bigint::text AS total_cost,
               ft.transaction_at::text
          FROM fuel.fuel_transactions ft
          JOIN fuel.fuel_card_overage_policies p
            ON p.operating_company_id = ft.operating_company_id
           AND p.is_active
           AND (p.driver_id = ft.driver_id OR p.driver_id IS NULL)
         WHERE ft.operating_company_id = $1::uuid
           AND ft.driver_id IS NOT NULL
           AND ft.overage_event_id IS NULL
      `,
      [operatingCompanyId]
    );

    for (const row of rows.rows) {
      stats.processed += 1;
      const result = await maybeEvaluateFuelCardOverage({
        operating_company_id: operatingCompanyId,
        actor_user_id: actorUserId ?? SYSTEM_ACTOR_USER_ID,
        fuel_transaction_id: row.id,
        fuel_type: row.fuel_type,
        transaction_at: row.transaction_at,
        amount_cents: Number(row.total_cost),
        driver_id: row.driver_id,
      });
      if (result.status === "flagged_review") stats.flagged += 1;
      else if (result.status === "company_variance") stats.company_variance += 1;
      else if (result.status === "error") stats.errors += 1;
    }
    return stats;
  });
}

export type FuelOverageRecoveryResult = FuelOverageEngineResult;
