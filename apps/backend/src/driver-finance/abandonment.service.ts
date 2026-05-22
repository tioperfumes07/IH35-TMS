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
      WHERE operating_company_id = $1
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
        AND operating_company_id = $2
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
        AND operating_company_id = $2
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

export async function applyApprovedAbandonmentChargebacksToSettlement(
  client: DbClient,
  input: { settlementId: string; driverId: string; operatingCompanyId: string }
): Promise<number> {
  const reg = await client.query<{ ok: boolean }>(`SELECT to_regclass('driver_finance.settlement_lines') IS NOT NULL AS ok`);
  if (!reg.rows[0]?.ok) return 0;

  const pending = await client.query<{ id: string; total_chargeback_cents: string | number; load_id: string }>(
    `
      SELECT id, total_chargeback_cents, load_id
      FROM driver_finance.abandonment_chargebacks
      WHERE operating_company_id = $1
        AND driver_id = $2
        AND status = 'approved'
        AND applied_to_settlement_id IS NULL
      ORDER BY abandonment_event_at ASC
      FOR UPDATE
    `,
    [input.operatingCompanyId, input.driverId]
  );

  let applied = 0;
  for (const row of pending.rows) {
    const cents = Math.max(0, Math.round(Number(row.total_chargeback_cents ?? 0)));
    const dollars = cents / 100;

    const loadLabelRes = await client.query<{ load_number: string | null }>(
      `SELECT load_number FROM mdata.loads WHERE id = $1 LIMIT 1`,
      [row.load_id]
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

    applied += 1;
  }

  return applied;
}
