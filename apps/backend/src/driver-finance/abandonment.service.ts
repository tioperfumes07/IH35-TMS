// C6-MONEY-JE-EXEMPT: abandonment_chargebacks records a not-yet-applied penalty (status starts
// 'pending'/'approved', applied_to_settlement_id NULL); it only becomes a real cash-affecting
// event via applyApprovedAbandonmentChargebacksToSettlement's settlement_lines insert below, which
// is itself a settlement-scoped LINE item — the settlement HEADER posts the one aggregate balanced
// JE at finalize via settlement-payrun-close.service.ts's closeSettlementPayRun (createJournalEntry) -- CORRECTED 2026-09-02: postSettlementToGl was RETIRED (SET-01, 2026-07-26), never live in prod (verified 2026-09-02, C6).
import { appendCrudAudit } from "../audit/crud-audit.js";
import { resolveSettlementMinNet } from "./settlement-deduction-cap.service.js";
import { forfeitDriverEscrowOnClient } from "./escrow-forfeit.service.js";

type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export type AbandonmentDefaultsRow = {
  default_towing_cost_cents: string | number;
  default_deadhead_rate_per_mile_cents: string | number;
  default_replacement_premium_pct: string | number;
  require_approval_above_cents: string | number;
};

export const FALLBACK_ABANDONMENT_DEFAULTS: AbandonmentDefaultsRow = {
  default_towing_cost_cents: 50000,
  default_deadhead_rate_per_mile_cents: 250,
  default_replacement_premium_pct: 25,
  require_approval_above_cents: 100000,
};

export async function loadAbandonmentDefaults(client: DbClient, operatingCompanyId: string): Promise<AbandonmentDefaultsRow> {
  const res = await client.query<AbandonmentDefaultsRow>(
    `
      SELECT
        default_towing_cost_cents,
        default_deadhead_rate_per_mile_cents,
        default_replacement_premium_pct,
        require_approval_above_cents
      FROM driver_finance.abandonment_defaults
      WHERE operating_company_id = $1::uuid
      LIMIT 1
    `,
    [operatingCompanyId]
  );
  return res.rows[0] ?? FALLBACK_ABANDONMENT_DEFAULTS;
}

export async function upsertAbandonmentDefaults(
  client: DbClient,
  input: {
    operatingCompanyId: string;
    default_towing_cost_cents: number;
    default_deadhead_rate_per_mile_cents: number;
    default_replacement_premium_pct: number;
    require_approval_above_cents: number;
  }
): Promise<AbandonmentDefaultsRow> {
  const res = await client.query<AbandonmentDefaultsRow>(
    `
      INSERT INTO driver_finance.abandonment_defaults (
        operating_company_id,
        default_towing_cost_cents,
        default_deadhead_rate_per_mile_cents,
        default_replacement_premium_pct,
        require_approval_above_cents,
        updated_at
      )
      VALUES ($1,$2,$3,$4,$5,now())
      ON CONFLICT (operating_company_id) DO UPDATE SET
        default_towing_cost_cents = EXCLUDED.default_towing_cost_cents,
        default_deadhead_rate_per_mile_cents = EXCLUDED.default_deadhead_rate_per_mile_cents,
        default_replacement_premium_pct = EXCLUDED.default_replacement_premium_pct,
        require_approval_above_cents = EXCLUDED.require_approval_above_cents,
        updated_at = now()
      RETURNING
        default_towing_cost_cents,
        default_deadhead_rate_per_mile_cents,
        default_replacement_premium_pct,
        require_approval_above_cents
    `,
    [
      input.operatingCompanyId,
      input.default_towing_cost_cents,
      input.default_deadhead_rate_per_mile_cents,
      input.default_replacement_premium_pct,
      input.require_approval_above_cents,
    ]
  );
  const row = res.rows[0];
  if (!row) throw new Error("abandonment_defaults_upsert_failed");
  return row;
}

export type ComputedChargeback = {
  towing_cost_cents: number;
  deadhead_miles: number;
  deadhead_cost_cents: number;
  replacement_driver_premium_cents: number;
  other_recovery_cost_cents: number;
  total_chargeback_cents: number;
  status: "pending" | "approved";
};

export function computeAbandonmentChargeback(input: {
  defaults: AbandonmentDefaultsRow;
  rate_total_cents: number;
  towing_cost_cents?: number | null;
  deadhead_miles?: number | string | null;
  deadhead_cost_cents?: number | null;
  replacement_driver_premium_cents?: number | null;
  other_recovery_cost_cents?: number | null;
}): ComputedChargeback {
  const defaultTowing = Math.max(
    0,
    Math.round(Number(input.defaults.default_towing_cost_cents ?? FALLBACK_ABANDONMENT_DEFAULTS.default_towing_cost_cents) || 0)
  );
  const towing =
    input.towing_cost_cents !== undefined && input.towing_cost_cents !== null
      ? Math.max(0, Math.round(Number(input.towing_cost_cents) || 0))
      : defaultTowing;

  let miles = input.deadhead_miles !== undefined && input.deadhead_miles !== null ? Number(input.deadhead_miles) : 0;
  if (!Number.isFinite(miles) || miles < 0) miles = 0;

  const deadheadRate = Math.max(
    0,
    Math.round(Number(input.defaults.default_deadhead_rate_per_mile_cents ?? FALLBACK_ABANDONMENT_DEFAULTS.default_deadhead_rate_per_mile_cents) || 0)
  );

  const deadheadCost =
    input.deadhead_cost_cents !== undefined && input.deadhead_cost_cents !== null
      ? Math.max(0, Math.round(Number(input.deadhead_cost_cents) || 0))
      : Math.round(miles * deadheadRate);

  const premiumPct = Number(input.defaults.default_replacement_premium_pct ?? FALLBACK_ABANDONMENT_DEFAULTS.default_replacement_premium_pct) || 0;
  const rateTotal = Math.max(0, Math.round(Number(input.rate_total_cents) || 0));

  const premium =
    input.replacement_driver_premium_cents !== undefined && input.replacement_driver_premium_cents !== null
      ? Math.max(0, Math.round(Number(input.replacement_driver_premium_cents) || 0))
      : Math.round((rateTotal * premiumPct) / 100);

  const other =
    input.other_recovery_cost_cents !== undefined && input.other_recovery_cost_cents !== null
      ? Math.max(0, Math.round(Number(input.other_recovery_cost_cents) || 0))
      : 0;

  const total = towing + deadheadCost + premium + other;
  const threshold = Math.max(
    0,
    Math.round(Number(input.defaults.require_approval_above_cents ?? FALLBACK_ABANDONMENT_DEFAULTS.require_approval_above_cents) || 0)
  );

  return {
    towing_cost_cents: towing,
    deadhead_miles: miles,
    deadhead_cost_cents: deadheadCost,
    replacement_driver_premium_cents: premium,
    other_recovery_cost_cents: other,
    total_chargeback_cents: total,
    status: total > threshold ? "pending" : "approved",
  };
}

async function emitOutbox(client: DbClient, eventType: string, payload: Record<string, unknown>) {
  /* outbox-handler-parity: literal-types=["load.abandoned","chargeback.created"] */
  await client.query(`INSERT INTO outbox.events (event_type, payload, next_retry_at) VALUES ($1, $2::jsonb, now())`, [
    eventType,
    JSON.stringify(payload),
  ]);
}

export async function recordLoadAbandonmentChargeback(
  client: DbClient,
  input: {
    operatingCompanyId: string;
    loadId: string;
    driverId: string;
    abandonmentEventAt: string;
    abandonmentLocation?: string | null;
    notes?: string | null;
    createdByUserId: string;
    towing_cost_cents?: number | null;
    deadhead_miles?: number | null;
    deadhead_cost_cents?: number | null;
    replacement_driver_premium_cents?: number | null;
    other_recovery_cost_cents?: number | null;
  }
): Promise<{ chargeback: Record<string, unknown>; computed: ComputedChargeback }> {
  const defaults = await loadAbandonmentDefaults(client, input.operatingCompanyId);

  const loadRes = await client.query<{
    rate_total_cents: string | number | null;
    assigned_primary_driver_id: string | null;
    assigned_secondary_driver_id: string | null;
    team_id: string | null;
  }>(
    `
      SELECT rate_total_cents, assigned_primary_driver_id, assigned_secondary_driver_id, team_id
      FROM mdata.loads
      WHERE id = $1
        AND operating_company_id = $2::uuid
        AND soft_deleted_at IS NULL
      LIMIT 1
    `,
    [input.loadId, input.operatingCompanyId]
  );
  const load = loadRes.rows[0];
  if (!load) throw new Error("load_not_found");

  let matchesDriver =
    load.assigned_primary_driver_id === input.driverId || load.assigned_secondary_driver_id === input.driverId;

  if (!matchesDriver && load.team_id) {
    const teamRes = await client.query<{ primary_driver_id: string; secondary_driver_id: string }>(
      `
        SELECT primary_driver_id, secondary_driver_id
        FROM mdata.driver_teams
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        LIMIT 1
      `,
      [load.team_id, input.operatingCompanyId]
    );
    const team = teamRes.rows[0];
    matchesDriver = team?.primary_driver_id === input.driverId || team?.secondary_driver_id === input.driverId;
  }

  if (!matchesDriver) throw new Error("driver_not_assigned_to_load");

  const computed = computeAbandonmentChargeback({
    defaults,
    rate_total_cents: Number(load.rate_total_cents ?? 0),
    towing_cost_cents: input.towing_cost_cents,
    deadhead_miles: input.deadhead_miles,
    deadhead_cost_cents: input.deadhead_cost_cents,
    replacement_driver_premium_cents: input.replacement_driver_premium_cents,
    other_recovery_cost_cents: input.other_recovery_cost_cents,
  });

  await client.query(
    `
      UPDATE mdata.loads
      SET status = 'abandoned',
          updated_at = now()
      WHERE id = $1
        AND operating_company_id = $2::uuid
        AND soft_deleted_at IS NULL
    `,
    [input.loadId, input.operatingCompanyId]
  );

  const insertRes = await client.query<Record<string, unknown>>(
    `
      INSERT INTO driver_finance.abandonment_chargebacks (
        operating_company_id,
        load_id,
        driver_id,
        abandonment_event_at,
        abandonment_location,
        towing_cost_cents,
        deadhead_miles,
        deadhead_cost_cents,
        replacement_driver_premium_cents,
        other_recovery_cost_cents,
        total_chargeback_cents,
        status,
        approval_user_id,
        approved_at,
        notes,
        created_by_user_id
      )
      VALUES (
        $1,$2,$3,$4::timestamptz,$5,
        $6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
      )
      RETURNING *
    `,
    [
      input.operatingCompanyId,
      input.loadId,
      input.driverId,
      input.abandonmentEventAt,
      input.abandonmentLocation ?? null,
      computed.towing_cost_cents,
      computed.deadhead_miles,
      computed.deadhead_cost_cents,
      computed.replacement_driver_premium_cents,
      computed.other_recovery_cost_cents,
      computed.total_chargeback_cents,
      computed.status,
      computed.status === "approved" ? input.createdByUserId : null,
      computed.status === "approved" ? new Date().toISOString() : null,
      input.notes ?? null,
      input.createdByUserId,
    ]
  );

  const chargeback = insertRes.rows[0];
  if (!chargeback) throw new Error("chargeback_insert_failed");

  await emitOutbox(client, "load.abandoned", {
    load_id: input.loadId,
    operating_company_id: input.operatingCompanyId,
    driver_id: input.driverId,
    abandonment_chargeback_id: chargeback.id,
  });

  await emitOutbox(client, "chargeback.created", {
    abandonment_chargeback_id: chargeback.id,
    load_id: input.loadId,
    operating_company_id: input.operatingCompanyId,
    driver_id: input.driverId,
    total_chargeback_cents: computed.total_chargeback_cents,
    status: computed.status,
  });

  return { chargeback, computed };
}

export type ApplyAbandonmentChargebacksResult = {
  appliedCount: number;
  appliedCents: number;
  /** Resolved via an escrow forfeiture DRAW (SAF-F01) instead of a settlement_lines deduction. */
  appliedViaEscrowCount: number;
  appliedViaEscrowCents: number;
  deferredCount: number;
  deferredCents: number;
};

/**
 * 00_LOCKED_DECISIONS 9.3 (owner direct instruction, 2026-09-02): "Walkoff/abandonment/damage
 * recoveries deduct from the driver's settlement pay first... fire a single charge per event."
 * Before this, the FULL total_chargeback_cents was applied to settlement pay with NO floor
 * protection at all — a genuine pre-existing gap (this settlement could go arbitrarily far below
 * the owner-locked net-pay floor). Now caps at the SAME floor-derived room
 * settlement-deduction-cap.service.ts computes (gross = earnings-type lines only; floor via
 * resolveSettlementMinNet) — matching that file's own locked "available = gross - floor only"
 * convention (decision C-2-A) rather than coordinating the two pools, which is that file's explicit,
 * deliberate design.
 *
 * The migration 0094 auto-escrow-proposal trigger (dispatch.trg_auto_propose_escrow_on_abandon) is
 * DROPPED in the companion migration (202613530001) — this function is now the ONE path an
 * abandonment/walkoff/no-show cost reaches a driver through, closing the double-charge the owner
 * flagged (this app-level chargeback AND the DB trigger's independent escrow proposal both firing
 * on the same event).
 *
 * ESCROW-SHORTFALL DRAW — RESOLVED 2026-09-03 (was the open question above; kept for history).
 * Live-verified on prod (bypass + n_live_tup completeness discriminator, same txn):
 * accounting.escrow_accounts (22 rows) is the table subledger-gl-control-rec.service.ts actually
 * sums for the "escrow_liability_default" GL-control reconciliation (sumEscrowSubledgerCents reads
 * FROM accounting.escrow_accounts) — that is the one authoritative, GL-reconciled escrow subledger;
 * driver_finance.escrow_balances/escrow_ledger (3 rows) is the driver-facing rollup kept in sync
 * WITH it (escrow-forfeit.service.ts's ESC-FORFEIT-SPLIT already writes both in one transaction, so
 * they never diverge). A DRAW here reuses that exact same, already-built, flag-gated
 * forfeitDriverEscrowOnClient (SAF-F01) — no new GL math. When a chargeback is over the
 * floor-protected settlement-pay room, this now tries a full-amount escrow forfeiture BEFORE
 * deferring: if the driver's escrow can fully cover it (and DRIVER_ESCROW_FORFEIT_GL_POSTING_ENABLED
 * is on for the entity), the chargeback resolves immediately via escrow instead of rolling to the
 * next settlement. If escrow can't cover it (over_draw) or the flag is off, behavior is UNCHANGED —
 * falls through to the existing floor-protected defer, never partially drawn, never silently dropped.
 */
export async function applyApprovedAbandonmentChargebacksToSettlement(
  client: DbClient,
  input: { settlementId: string; driverId: string; operatingCompanyId: string; actorUserId: string }
): Promise<ApplyAbandonmentChargebacksResult> {
  const empty: ApplyAbandonmentChargebacksResult = {
    appliedCount: 0,
    appliedCents: 0,
    appliedViaEscrowCount: 0,
    appliedViaEscrowCents: 0,
    deferredCount: 0,
    deferredCents: 0,
  };
  const reg = await client.query<{ ok: boolean }>(`SELECT to_regclass('driver_finance.settlement_lines') IS NOT NULL AS ok`);
  if (!reg.rows[0]?.ok) return empty;

  // Same gross/floor shape as settlement-deduction-cap.service.ts's
  // applyPendingDeductionsToSettlementWithNetFloor — gross from earnings-type lines only.
  const grossRes = await client.query<{ gross_cents: string | number | null }>(
    `
      SELECT COALESCE(ROUND(SUM(amount) * 100), 0)::bigint AS gross_cents
      FROM driver_finance.settlement_lines
      WHERE settlement_id = $1
        AND line_type IN ('earnings', 'extra_pay', 'team_split_primary', 'team_split_secondary')
        AND is_active = true
    `,
    [input.settlementId]
  );
  const grossCents = Math.max(0, Math.round(Number(grossRes.rows[0]?.gross_cents ?? 0)));
  const minNet = await resolveSettlementMinNet(client, input.driverId, input.operatingCompanyId);
  const floorCents = Math.max(Math.round((grossCents * minNet.pct) / 100), minNet.cents);
  let availableCents = Math.max(0, grossCents - floorCents);

  const pending = await client.query<{ id: string; total_chargeback_cents: string | number; load_id: string }>(
    `
      SELECT id, total_chargeback_cents, load_id
      FROM driver_finance.abandonment_chargebacks
      WHERE operating_company_id = $1::uuid
        AND driver_id = $2
        AND status = 'approved'
        AND applied_to_settlement_id IS NULL
      ORDER BY abandonment_event_at ASC
      FOR UPDATE
    `,
    [input.operatingCompanyId, input.driverId]
  );

  const result: ApplyAbandonmentChargebacksResult = { ...empty };
  for (const row of pending.rows) {
    const cents = Math.max(0, Math.round(Number(row.total_chargeback_cents ?? 0)));
    if (cents <= 0) continue;

    if (cents > availableCents) {
      // Over the floor-protected settlement-pay room — try an escrow DRAW (SAF-F01 forfeiture,
      // reused verbatim) before deferring. Full-amount only: a partial forfeiture would leave the
      // chargeback in an ambiguous half-applied state this table has no column to represent, so
      // anything the driver's escrow can't fully cover falls straight through to the existing defer.
      const escrowAttempt = await forfeitDriverEscrowOnClient(
        client,
        {
          operating_company_id: input.operatingCompanyId,
          driver_uuid: input.driverId,
          amount_cents: cents,
          reason: `Abandonment chargeback — load ${row.load_id}`,
        },
        { userId: input.actorUserId, role: "system" }
      );

      if (escrowAttempt.result === "posted") {
        await client.query(
          `
            UPDATE driver_finance.abandonment_chargebacks
            SET status = 'applied',
                applied_to_settlement_id = $2::uuid,
                notes = COALESCE(notes || E'\\n', '') || $3,
                updated_at = now()
            WHERE id = $1::uuid
          `,
          [
            row.id,
            input.settlementId,
            `Resolved via escrow forfeiture (SAF-F01) — journal_entry_id=${escrowAttempt.journal_entry_id}, escrow_posting_id=${escrowAttempt.escrow_posting_id}, amount_cents=${cents}. No settlement_lines row (pay stayed floor-protected).`,
          ]
        );
        result.appliedViaEscrowCount += 1;
        result.appliedViaEscrowCents += cents;
        await appendCrudAudit(
          client,
          input.actorUserId,
          "driver_finance.abandonment_chargeback.applied_via_escrow_draw",
          {
            resource_type: "driver_finance.abandonment_chargebacks",
            resource_id: row.id,
            operating_company_id: input.operatingCompanyId,
            driver_id: input.driverId,
            settlement_id: input.settlementId,
            amount_cents: cents,
            journal_entry_id: escrowAttempt.journal_entry_id,
            escrow_posting_id: escrowAttempt.escrow_posting_id,
          },
          "warning",
          "ACCT-9.3-PAY-FIRST"
        );
        continue;
      }

      // over_draw / flag_off — behavior UNCHANGED from before this DRAW existed: defer (roll to
      // next settlement), never breach the floor, never silently drop it.
      result.deferredCount += 1;
      result.deferredCents += cents;
      await appendCrudAudit(
        client,
        input.actorUserId,
        "driver_finance.abandonment_chargeback.deferred_over_floor",
        {
          resource_type: "driver_finance.abandonment_chargebacks",
          resource_id: row.id,
          operating_company_id: input.operatingCompanyId,
          driver_id: input.driverId,
          settlement_id: input.settlementId,
          amount_cents: cents,
          gross_cents: grossCents,
          floor_cents: floorCents,
          available_cents: availableCents,
          min_net_pct: minNet.pct,
          min_net_cents: minNet.cents,
          escrow_draw_attempt: escrowAttempt.result,
        },
        "warning",
        "ACCT-9.3-PAY-FIRST"
      );
      continue;
    }

    const dollars = cents / 100;

    const loadLabelRes = await client.query<{ load_number: string | null }>(
      `SELECT load_number FROM mdata.loads WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
      [row.load_id, input.operatingCompanyId]
    );
    const loadNumber = loadLabelRes.rows[0]?.load_number ? String(loadLabelRes.rows[0].load_number) : String(row.load_id);

    const lineRes = await client.query<{ id: string }>(
      `
        INSERT INTO driver_finance.settlement_lines (settlement_id, line_type, description, amount)
        VALUES ($1, 'abandonment_chargeback', $2, $3)
        RETURNING id
      `,
      [input.settlementId, `Abandonment chargeback — load ${loadNumber}`, dollars]
    );

    const lineId = lineRes.rows[0]?.id ? String(lineRes.rows[0].id) : "";
    if (!lineId) continue;

    await client.query(
      `
        UPDATE driver_finance.abandonment_chargebacks
        SET settlement_line_id = $2::uuid,
            applied_to_settlement_id = $3::uuid,
            status = 'applied',
            updated_at = now()
        WHERE id = $1::uuid
      `,
      [row.id, lineId, input.settlementId]
    );

    availableCents -= cents;
    result.appliedCount += 1;
    result.appliedCents += cents;
  }

  return result;
}
