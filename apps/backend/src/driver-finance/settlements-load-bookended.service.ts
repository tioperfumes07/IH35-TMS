import { appendCrudAudit } from "../audit/crud-audit.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { recordPostingFlagSkip } from "../accounting/posting-flag-skip-audit.js";
import { applyApprovedAbandonmentChargebacksToSettlement } from "./abandonment.service.js";
import { applyPendingDeductionsToSettlementWithNetFloor } from "./settlement-deduction-cap.service.js";
import { applyAutoDeductionsToSettlement } from "../settlements/auto-deductions/apply.js";
import { computeSettlementContractTerms, SETTLEMENT_CONTRACT_TERMS_FLAG } from "./settlement-contract-terms.service.js";
import { appendSettlementLineFromDriverBillIfMissing, fetchTeamDriversForLoad } from "./settlement-engine.js";

/**
 * OFF-by-default flag (per-entity-only; routed through the canonical `isEnabled` resolver, NOT a
 * raw lib.feature_flags read). When OFF the close behaves exactly as before (earnings + abandonment
 * only) — deductions are NOT applied. When ON (owner flips per entity, TRANSP first) the canonical
 * deduction applier runs inside the close transaction, after earnings/abandonment lines exist and
 * BEFORE aggregateSettlementTotals recomputes net_pay, closing the "drivers overpaid" gap. TIER-1
 * FINANCIAL — flag flip is Jorge's.
 */
export const SETTLEMENT_DEDUCTION_APPLY_FLAG = "SETTLEMENT_DEDUCTION_APPLY_ENABLED";

type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

type TeamLoadSplitContext = NonNullable<Awaited<ReturnType<typeof fetchTeamDriversForLoad>>>;

export function settlementDisplayIdFromLoadNumber(loadNumber: string): string {
  const trimmed = String(loadNumber ?? "").trim();
  const suffix = trimmed.replace(/^[Ll]-/, "");
  return `S-${suffix}`;
}

async function emitOutbox(client: DbClient, eventType: string, payload: Record<string, unknown>) {
  /* outbox-handler-parity: literal-types=["driver_finance.settlement.opened","driver_finance.settlement.payment_due","driver_finance.settlement.closed"] */
  await client.query(`INSERT INTO outbox.events (event_type, payload, next_retry_at) VALUES ($1, $2::jsonb, now())`, [
    eventType,
    JSON.stringify(payload),
  ]);
}

export async function openLoadBookendedSettlement(
  client: DbClient,
  opts: {
    driverId: string;
    operatingCompanyId: string;
    firstLoadId: string;
    actorUserId: string;
  }
): Promise<{ settlementId: string; settlementNumber: string }> {
  const loadRes = await client.query<{
    id: string;
    load_number: string;
    assigned_primary_driver_id: string | null;
    assigned_secondary_driver_id: string | null;
    operating_company_id: string;
  }>(
    `
      SELECT id, load_number, assigned_primary_driver_id, assigned_secondary_driver_id, operating_company_id
      FROM mdata.loads
      WHERE id = $1
        AND operating_company_id = $2
        AND soft_deleted_at IS NULL
      LIMIT 1
    `,
    [opts.firstLoadId, opts.operatingCompanyId]
  );
  const load = loadRes.rows[0] ?? null;
  if (!load) throw new Error("load_not_found");

  const matchesDriver =
    load.assigned_primary_driver_id === opts.driverId || load.assigned_secondary_driver_id === opts.driverId;
  if (!matchesDriver) throw new Error("driver_not_assigned_to_load");

  const pickupRes = await client.query<{ pickup_at: string | null }>(
    `
      SELECT ls.actual_departure_at AS pickup_at
      FROM mdata.load_stops ls
      WHERE ls.load_id = $1
        AND ls.stop_type = 'pickup'
      ORDER BY ls.sequence_number ASC
      LIMIT 1
    `,
    [opts.firstLoadId]
  );
  const pickupAt = pickupRes.rows[0]?.pickup_at ?? null;
  const tripStartedAt = pickupAt ?? new Date().toISOString();

  const existing = await client.query<{ id: string; display_id: string | null }>(
    `
      SELECT id, display_id
      FROM driver_finance.driver_settlements
      WHERE driver_id = $1
        AND operating_company_id = $2
        AND settlement_model = 'load_bookended'
        AND trip_closed_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE
    `,
    [opts.driverId, opts.operatingCompanyId]
  );

  if (existing.rows[0]?.id) {
    const settlementId = String(existing.rows[0].id);
    const settlementNumber = String(existing.rows[0].display_id ?? settlementId);
    return { settlementId, settlementNumber };
  }

  const settlementNumber = settlementDisplayIdFromLoadNumber(load.load_number);
  const periodDate = String(tripStartedAt).slice(0, 10);

  const inserted = await client.query<{ id: string; display_id: string | null }>(
    `
      INSERT INTO driver_finance.driver_settlements (
        operating_company_id,
        display_id,
        driver_id,
        period_start,
        period_end,
        status,
        gross_pay,
        deductions_total,
        reimbursements_total,
        net_pay,
        settlement_model,
        first_load_id,
        first_load_number,
        trip_started_at
      )
      VALUES (
        $1,$2,$3,$4::date,$5::date,'open',0,0,0,0,
        'load_bookended',$6,$7,$8::timestamptz
      )
      RETURNING id, display_id
    `,
    [
      opts.operatingCompanyId,
      settlementNumber,
      opts.driverId,
      periodDate,
      periodDate,
      opts.firstLoadId,
      load.load_number,
      tripStartedAt,
    ]
  );

  const settlementId = String(inserted.rows[0]?.id ?? "");
  if (!settlementId) throw new Error("settlement_insert_failed");

  await appendCrudAudit(
    client,
    opts.actorUserId,
    "driver_finance.settlement.opened",
    {
      settlement_id: settlementId,
      driver_id: opts.driverId,
      operating_company_id: opts.operatingCompanyId,
      first_load_id: opts.firstLoadId,
      settlement_number: settlementNumber,
    },
    "info",
    "P6-T11176"
  );

  await emitOutbox(client, "driver_finance.settlement.opened", {
    settlement_id: settlementId,
    driver_id: opts.driverId,
    operating_company_id: opts.operatingCompanyId,
    first_load_id: opts.firstLoadId,
    settlement_number: settlementNumber,
  });

  return { settlementId, settlementNumber };
}

export async function aggregateSettlementTotals(
  client: DbClient,
  settlementId: string
): Promise<{
  gross_pay: number;
  deductions_total: number;
  reimbursements_total: number;
  net_pay: number;
}> {
  const totalsRes = await client.query<{
    earnings: string | number | null;
    deductions: string | number | null;
    reimbursements: string | number | null;
  }>(
    `
      SELECT
        COALESCE(SUM(CASE WHEN line_type IN ('earnings', 'extra_pay', 'team_split_primary', 'team_split_secondary') THEN amount ELSE 0 END), 0) AS earnings,
        COALESCE(SUM(CASE WHEN line_type IN ('deduction', 'abandonment_chargeback') THEN amount ELSE 0 END), 0) AS deductions,
        COALESCE(SUM(CASE WHEN line_type = 'reimbursement' THEN amount ELSE 0 END), 0) AS reimbursements
      FROM driver_finance.settlement_lines
      WHERE settlement_id = $1
        -- ACCT-F156: settlement_lines soft-deletes via is_active, so an inactive line stays here with
        -- its amount. Unfiltered, this misstates ALL THREE aggregates at once -- earnings, deductions
        -- and reimbursements -- which is the driver's entire settlement. Table is empty today; latent
        -- until pay-runs start, which is exactly when nobody re-audits it.
        AND is_active = true
    `,
    [settlementId]
  );

  const gross = Number(totalsRes.rows[0]?.earnings ?? 0);
  const deductions = Number(totalsRes.rows[0]?.deductions ?? 0);
  const reimbursements = Number(totalsRes.rows[0]?.reimbursements ?? 0);
  const net = gross - deductions + reimbursements;

  await client.query(
    `
      UPDATE driver_finance.driver_settlements
      SET gross_pay = $2,
          deductions_total = $3,
          reimbursements_total = $4,
          net_pay = $5,
          updated_at = now()
      WHERE id = $1
    `,
    [settlementId, gross, deductions, reimbursements, net]
  );

  return { gross_pay: gross, deductions_total: deductions, reimbursements_total: reimbursements, net_pay: net };
}

async function closeLoadBookendedSettlementForDriver(
  client: DbClient,
  opts: {
    operatingCompanyId: string;
    actorUserId: string;
    load: { id: string; load_number: string };
    driverId: string;
    team: TeamLoadSplitContext | null;
  }
): Promise<number> {
  const busyRes = await client.query<{ cnt: number }>(
    `
      SELECT count(*)::int AS cnt
      FROM mdata.loads l
      WHERE l.operating_company_id = $1
        AND l.soft_deleted_at IS NULL
        AND l.id <> $2::uuid
        AND (
          l.assigned_primary_driver_id = $3
          OR l.assigned_secondary_driver_id = $3
          OR (
            l.team_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM mdata.driver_teams t
              WHERE t.id = l.team_id
                AND (t.primary_driver_id = $3 OR t.secondary_driver_id = $3)
            )
          )
        )
        AND l.status::text IN (
          'draft', 'booked', 'planned', 'assigned',
          'dispatched', 'at_pickup', 'in_transit', 'at_delivery'
        )
    `,
    [opts.operatingCompanyId, opts.load.id, opts.driverId]
  );

  const busy = Number(busyRes.rows[0]?.cnt ?? 0);
  if (busy > 0) return 0;

  const openRes = await client.query<{ id: string }>(
    `
      SELECT id
      FROM driver_finance.driver_settlements
      WHERE operating_company_id = $1
        AND driver_id = $2
        AND settlement_model = 'load_bookended'
        AND trip_closed_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE
    `,
    [opts.operatingCompanyId, opts.driverId]
  );

  const settlementId = openRes.rows[0]?.id ? String(openRes.rows[0].id) : "";
  if (!settlementId) return 0;

  const closedAt = new Date().toISOString();

  await client.query(
    `
      UPDATE driver_finance.driver_settlements
      SET trip_closed_at = $2::timestamptz,
          status = 'closed',
          last_load_id = $3,
          last_load_number = $4,
          period_end = ($2::timestamptz)::date,
          updated_at = now()
      WHERE id = $1
    `,
    [settlementId, closedAt, opts.load.id, opts.load.load_number]
  );

  const lineType =
    opts.team && opts.driverId === opts.team.primaryDriverId
      ? ("team_split_primary" as const)
      : opts.team
        ? ("team_split_secondary" as const)
        : ("earnings" as const);

  await appendSettlementLineFromDriverBillIfMissing(client, {
    settlementId,
    driverId: opts.driverId,
    loadId: opts.load.id,
    teamId: opts.team?.teamId ?? null,
    lineType,
  });

  await applyApprovedAbandonmentChargebacksToSettlement(client, {
    settlementId,
    driverId: opts.driverId,
    operatingCompanyId: opts.operatingCompanyId,
  });

  // ── Hire-contract terms computation (OFF-flag-gated) ───────────────────────────────────────────
  // Compute the five signed-hire-contract money terms (MPG +$35, referral $200, late-delivery
  // pass-through, driver fines, reimbursements). Runs AFTER earnings/abandonment lines exist and BEFORE
  // the net-floor deduction applier + aggregateSettlementTotals — so the MPG/referral bonuses raise gross
  // first, and the pass-through/fine deductions this creates are picked up by the SAME existing applier
  // (net-floor capped, pay-first). NO new GL math: bonuses ride the poster's driver-pay/reimbursement
  // legs; deductions ride the bucketed deduction poster. Per-entity OFF flag; Jorge flips (TRANSP first).
  const contractTermsEnabled = await isEnabled(client, SETTLEMENT_CONTRACT_TERMS_FLAG, {
    operating_company_id: opts.operatingCompanyId,
  });
  if (contractTermsEnabled) {
    await computeSettlementContractTerms(client, {
      settlementId,
      driverId: opts.driverId,
      operatingCompanyId: opts.operatingCompanyId,
      actorUserId: opts.actorUserId,
    });
  } else {
    // Flag OFF: contract-terms money is not applied. Record the skip append-only so the settlement
    // close is never a silent no-op on this leg (verify-no-silent-noop-posting).
    await recordPostingFlagSkip(client, opts.actorUserId, {
      flagKey: SETTLEMENT_CONTRACT_TERMS_FLAG,
      postingDomain: "driver_finance.settlement_contract_terms",
      operatingCompanyId: opts.operatingCompanyId,
      context: { settlement_id: settlementId, driver_id: opts.driverId, last_load_id: opts.load.id },
    });
  }

  // ── Deduction applier (OFF-flag-gated) ─────────────────────────────────────────────────────────
  // REPAIR-A root cause: the canonical close applied earnings + abandonment but NEVER general
  // cash-advance / other deductions, because the applier had no non-test caller → drivers overpaid.
  // Wire the EXISTING applier here (reuse — no new GL/posting math), gated behind an OFF flag routed
  // through the canonical `isEnabled` resolver (per-entity, kill-switch aware — fixes the H3-4 raw-read
  // pattern). Runs on the SAME client (inside the close transaction), AFTER earnings/abandonment lines
  // exist and BEFORE aggregateSettlementTotals recomputes net_pay. OFF => skipped => net pay unchanged.
  const deductionApplyEnabled = await isEnabled(client, SETTLEMENT_DEDUCTION_APPLY_FLAG, {
    operating_company_id: opts.operatingCompanyId,
  });
  if (deductionApplyEnabled) {
    // P2a (owner DECISION 1, 2026-07-21): FIRST materialize active auto-deduction-policy tranches
    // into the canonical driver_finance.driver_settlement_deductions sub-ledger (cents), so the
    // net-floor cap applier below SEES them — closing the hole where an auto policy could push a
    // driver below the net floor invisibly. Same flag, no settlement_lines writes, no totals math
    // (idempotent via the one-open-tranche-per-policy partial unique index).
    const autoMaterialized = await applyAutoDeductionsToSettlement(client, {
      settlementId,
      driverId: opts.driverId,
      operatingCompanyId: opts.operatingCompanyId,
      actorUserId: opts.actorUserId,
    });

    const applied = await applyPendingDeductionsToSettlementWithNetFloor(client, {
      settlementId,
      driverId: opts.driverId,
      operatingCompanyId: opts.operatingCompanyId,
      actorUserId: opts.actorUserId,
    });

    // Spine audit event for the apply (append-only; ties net-pay reduction to the deduction ledger).
    await appendCrudAudit(
      client,
      opts.actorUserId,
      "driver_finance.settlement.deductions_applied",
      {
        settlement_id: settlementId,
        driver_id: opts.driverId,
        operating_company_id: opts.operatingCompanyId,
        last_load_id: opts.load.id,
        applied_count: applied.appliedCount,
        applied_cents: applied.appliedCents,
        deferred_count: applied.deferredCount,
        deferred_cents: applied.deferredCents,
        gross_cents: applied.grossCents,
        floor_cents: applied.floorCents,
        available_cents: applied.availableCents,
        // P2a additive fields: auto-deduction tranches materialized into the sub-ledger this close.
        auto_materialized_count: autoMaterialized.materialized.length,
        auto_materialized_cents: autoMaterialized.total_materialized_cents,
        auto_materializer_schema_ready: autoMaterialized.schema_ready,
      },
      "info",
      "REPAIR-A-DEDUCTION-APPLY"
    );
  } else {
    // Flag OFF: pending deductions are NOT applied (net pay unchanged). Record the skip append-only
    // so this never silently overpays a driver undetected (verify-no-silent-noop-posting; REPAIR-A).
    await recordPostingFlagSkip(client, opts.actorUserId, {
      flagKey: SETTLEMENT_DEDUCTION_APPLY_FLAG,
      postingDomain: "driver_finance.settlement_deductions",
      operatingCompanyId: opts.operatingCompanyId,
      context: { settlement_id: settlementId, driver_id: opts.driverId, last_load_id: opts.load.id },
    });
  }

  const totals = await aggregateSettlementTotals(client, settlementId);

  await emitOutbox(client, "driver_finance.settlement.payment_due", {
    settlement_id: settlementId,
    driver_id: opts.driverId,
    operating_company_id: opts.operatingCompanyId,
    gross_pay: totals.gross_pay,
    deductions_total: totals.deductions_total,
    reimbursements_total: totals.reimbursements_total,
    net_pay: totals.net_pay,
  });

  await appendCrudAudit(
    client,
    opts.actorUserId,
    "driver_finance.settlement.closed",
    {
      settlement_id: settlementId,
      driver_id: opts.driverId,
      operating_company_id: opts.operatingCompanyId,
      last_load_id: opts.load.id,
      load_number: opts.load.load_number,
    },
    "info",
    "P6-T11176"
  );

  await emitOutbox(client, "driver_finance.settlement.closed", {
    settlement_id: settlementId,
    driver_id: opts.driverId,
    operating_company_id: opts.operatingCompanyId,
    last_load_id: opts.load.id,
    load_number: opts.load.load_number,
  });

  return 1;
}

export async function closeSettlementForFinalLoad(
  client: DbClient,
  opts: { loadId: string; operatingCompanyId: string; actorUserId: string }
): Promise<{ closedSettlements: number }> {
  const loadRes = await client.query<{
    id: string;
    load_number: string;
    assigned_primary_driver_id: string | null;
    assigned_secondary_driver_id: string | null;
  }>(
    `
      SELECT id, load_number, assigned_primary_driver_id, assigned_secondary_driver_id
      FROM mdata.loads
      WHERE id = $1 AND operating_company_id = $2 AND soft_deleted_at IS NULL
      LIMIT 1
    `,
    [opts.loadId, opts.operatingCompanyId]
  );
  const load = loadRes.rows[0] ?? null;
  if (!load) return { closedSettlements: 0 };

  const team = await fetchTeamDriversForLoad(client, { operatingCompanyId: opts.operatingCompanyId, loadId: load.id });
  const driverIds = team
    ? [team.primaryDriverId, team.secondaryDriverId]
    : [load.assigned_primary_driver_id ?? load.assigned_secondary_driver_id ?? null].filter((v): v is string => Boolean(v));

  if (driverIds.length === 0) return { closedSettlements: 0 };

  let closed = 0;
  for (const driverId of driverIds) {
    closed += await closeLoadBookendedSettlementForDriver(client, {
      operatingCompanyId: opts.operatingCompanyId,
      actorUserId: opts.actorUserId,
      load,
      driverId,
      team,
    });
  }

  return { closedSettlements: closed };
}

export async function getActiveSettlementForDriver(
  client: DbClient,
  input: { driverId: string; operatingCompanyId: string }
): Promise<{ settlementId: string; settlementNumber: string | null } | null> {
  const res = await client.query<{ id: string; display_id: string | null }>(
    `
      SELECT id, display_id
      FROM driver_finance.driver_settlements
      WHERE driver_id = $1
        AND operating_company_id = $2
        AND settlement_model = 'load_bookended'
        AND trip_closed_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [input.driverId, input.operatingCompanyId]
  );
  const row = res.rows[0];
  if (!row?.id) return null;
  return { settlementId: String(row.id), settlementNumber: row.display_id ? String(row.display_id) : null };
}

export async function pingSettlementOnLoadEvent(
  client: DbClient,
  opts: {
    loadId: string;
    operatingCompanyId: string;
    /** Dispatch-facing milestone mapped inside this helper */
    dispatchTargetStatus: string;
    actorUserId: string;
  }
): Promise<void> {
  const loadRes = await client.query<{
    assigned_primary_driver_id: string | null;
    assigned_secondary_driver_id: string | null;
    team_id: string | null;
  }>(
    `
      SELECT assigned_primary_driver_id, assigned_secondary_driver_id, team_id
      FROM mdata.loads
      WHERE id = $1 AND operating_company_id = $2 AND soft_deleted_at IS NULL
      LIMIT 1
    `,
    [opts.loadId, opts.operatingCompanyId]
  );
  const load = loadRes.rows[0] ?? null;
  if (!load) return;

  const team = await fetchTeamDriversForLoad(client, { operatingCompanyId: opts.operatingCompanyId, loadId: opts.loadId });

  if (opts.dispatchTargetStatus === "in_transit") {
    if (team) {
      await openLoadBookendedSettlement(client, {
        driverId: team.primaryDriverId,
        operatingCompanyId: opts.operatingCompanyId,
        firstLoadId: opts.loadId,
        actorUserId: opts.actorUserId,
      });
      await openLoadBookendedSettlement(client, {
        driverId: team.secondaryDriverId,
        operatingCompanyId: opts.operatingCompanyId,
        firstLoadId: opts.loadId,
        actorUserId: opts.actorUserId,
      });
      return;
    }

    const primary = load.assigned_primary_driver_id ?? null;
    const secondary = load.assigned_secondary_driver_id ?? null;
    const settlementDriverId = primary ?? secondary;
    if (!settlementDriverId) return;

    await openLoadBookendedSettlement(client, {
      driverId: settlementDriverId,
      operatingCompanyId: opts.operatingCompanyId,
      firstLoadId: opts.loadId,
      actorUserId: opts.actorUserId,
    });
    return;
  }

  if (opts.dispatchTargetStatus === "delivered_pending_docs") {
    await closeSettlementForFinalLoad(client, {
      loadId: opts.loadId,
      operatingCompanyId: opts.operatingCompanyId,
      actorUserId: opts.actorUserId,
    });
  }
}
