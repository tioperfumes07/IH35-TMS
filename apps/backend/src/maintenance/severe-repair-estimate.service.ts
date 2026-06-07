import type { PoolClient } from "pg";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";

type SevereEstimateRow = {
  id: string;
  unit_id: string;
  unit_number: string | null;
  trigger_wo_id: string | null;
  damage_severity: string;
  estimate_status: string;
  estimate_location: string | null;
  estimated_labor_cents: number;
  estimated_parts_cents: number;
  estimated_outside_service_cents: number;
  estimated_total_cents: number;
  description: string | null;
  estimated_completion_date: string | null;
  refreshed_at: string;
  is_oos: boolean;
  oos_since: string | null;
  days_oos: number;
};

export async function listOpenEstimates(client: PoolClient, operating_company_id: string) {
  const res = await client.query<SevereEstimateRow>(
    `
      SELECT
        e.id,
        e.unit_id,
        u.unit_number,
        e.trigger_wo_id,
        e.damage_severity,
        e.estimate_status,
        e.estimate_location,
        e.estimated_labor_cents,
        e.estimated_parts_cents,
        e.estimated_outside_service_cents,
        e.estimated_total_cents,
        e.description,
        e.estimated_completion_date::text,
        e.refreshed_at::text,
        u.is_oos,
        u.oos_since::text,
        COALESCE(EXTRACT(EPOCH FROM (now() - u.oos_since)) / 86400, 0)::numeric AS days_oos
      FROM maintenance.severe_repair_estimates e
      LEFT JOIN mdata.units u ON u.id = e.unit_id
      WHERE e.operating_company_id = $1
        AND e.estimate_status IN ('open', 'awaiting_approval', 'approved')
      ORDER BY e.estimated_total_cents DESC
    `,
    [operating_company_id]
  );
  return res.rows;
}

export type FleetRestoreCost = {
  total_estimated_cents: number;
  total_actual_cents: number;
  total_remaining_cents: number;
  unit_count: number;
  avg_days_open: number;
};

export type PerUnitBreakdownRow = {
  unit_id: string;
  display_id: string;
  open_wo_count: number;
  total_cost_cents: number;
  severity: string;
};

export async function getFleetRestoreCost(client: PoolClient, operating_company_id: string): Promise<FleetRestoreCost> {
  const res = await client.query<{
    total_estimated_cents: string;
    total_actual_cents: string;
    unit_count: number;
    avg_days_open: number;
  }>(
    `
      SELECT
        COALESCE(SUM(e.estimated_total_cents), 0)::bigint AS total_estimated_cents,
        COALESCE(SUM(ROUND(COALESCE(w.total_actual_cost, 0)::numeric * 100)), 0)::bigint AS total_actual_cents,
        COUNT(DISTINCT e.unit_id)::int AS unit_count,
        COALESCE(AVG(EXTRACT(EPOCH FROM (now() - COALESCE(w.opened_at, e.created_at))) / 86400), 0)::numeric AS avg_days_open
      FROM maintenance.severe_repair_estimates e
      LEFT JOIN maintenance.work_orders w ON w.id = e.trigger_wo_id
      LEFT JOIN mdata.units u ON u.id = e.unit_id
      WHERE e.operating_company_id = $1
        AND e.estimate_status IN ('open', 'awaiting_approval', 'approved')
    `,
    [operating_company_id]
  );
  const row = res.rows[0];
  const totalEstimated = Number(row?.total_estimated_cents ?? 0);
  const totalActual = Number(row?.total_actual_cents ?? 0);
  return {
    total_estimated_cents: totalEstimated,
    total_actual_cents: totalActual,
    total_remaining_cents: Math.max(0, totalEstimated - totalActual),
    unit_count: Number(row?.unit_count ?? 0),
    avg_days_open: Number(row?.avg_days_open ?? 0),
  };
}

export async function getPerUnitBreakdown(client: PoolClient, operating_company_id: string): Promise<PerUnitBreakdownRow[]> {
  const res = await client.query<PerUnitBreakdownRow>(
    `
      SELECT
        e.unit_id,
        COALESCE(u.unit_number, LEFT(e.unit_id::text, 8)) AS display_id,
        COUNT(*)::int AS open_wo_count,
        COALESCE(SUM(e.estimated_total_cents), 0)::bigint AS total_cost_cents,
        MAX(e.damage_severity)::text AS severity
      FROM maintenance.severe_repair_estimates e
      LEFT JOIN mdata.units u ON u.id = e.unit_id
      WHERE e.operating_company_id = $1
        AND e.estimate_status IN ('open', 'awaiting_approval', 'approved')
      GROUP BY e.unit_id, u.unit_number
      ORDER BY total_cost_cents DESC
    `,
    [operating_company_id]
  );
  return res.rows.map((row) => ({
    ...row,
    total_cost_cents: Number(row.total_cost_cents),
  }));
}

export async function getRollupTotal(client: PoolClient, operating_company_id: string) {
  const res = await client.query<{
    open_count: number;
    total_cents: number;
    avg_days_oos: number;
    oldest_oos_days: number;
  }>(
    `
      SELECT
        COUNT(*)::int AS open_count,
        COALESCE(SUM(e.estimated_total_cents), 0)::bigint AS total_cents,
        COALESCE(AVG(EXTRACT(EPOCH FROM (now() - u.oos_since)) / 86400), 0)::numeric AS avg_days_oos,
        COALESCE(MAX(EXTRACT(EPOCH FROM (now() - u.oos_since)) / 86400), 0)::numeric AS oldest_oos_days
      FROM maintenance.severe_repair_estimates e
      LEFT JOIN mdata.units u ON u.id = e.unit_id
      WHERE e.operating_company_id = $1
        AND e.estimate_status IN ('open', 'awaiting_approval', 'approved')
    `,
    [operating_company_id]
  );
  return res.rows[0] ?? { open_count: 0, total_cents: 0, avg_days_oos: 0, oldest_oos_days: 0 };
}

export async function manualMarkUnitOos(
  userId: string,
  input: {
    operating_company_id: string;
    unit_id: string;
    reason: string;
    oos_location?: string;
  }
) {
  if (!input.reason || input.reason.trim().length < 5) {
    throw new Error("E_REASON_REQUIRED: reason >=5 chars required");
  }

  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operating_company_id]);

    const res = await client.query<{ id: string; unit_number: string }>(
      `
        UPDATE mdata.units
        SET is_oos = true,
            oos_since = COALESCE(oos_since, now()),
            oos_reason = $3,
            oos_location = $4
        WHERE id = $1
          AND COALESCE(currently_leased_to_company_id, owner_company_id) = $2::uuid
          AND is_oos = false
        RETURNING id, unit_number
      `,
      [input.unit_id, input.operating_company_id, input.reason.trim(), input.oos_location ?? null]
    );

    if (res.rows.length === 0) throw new Error("E_NOT_FOUND_OR_ALREADY_OOS");

    await appendCrudAudit(
      client,
      userId,
      "maintenance.unit.marked_oos",
      {
        resource_type: "mdata.units",
        resource_id: res.rows[0].id,
        operating_company_id: input.operating_company_id,
        unit_number: res.rows[0].unit_number,
        reason: input.reason.trim(),
        oos_location: input.oos_location ?? null,
      },
      "warning",
      "P5-E5-OOS"
    );

    return { unit_id: res.rows[0].id };
  });
}

export async function manualReturnUnitToService(
  userId: string,
  input: { operating_company_id: string; unit_id: string; review_notes: string }
) {
  if (!input.review_notes || input.review_notes.trim().length < 10) {
    throw new Error("E_REVIEW_NOTES_REQUIRED: review_notes >=10 chars required");
  }

  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operating_company_id]);

    const stillOpen = await client.query<{ ct: number }>(
      `
        SELECT COUNT(*)::int AS ct
        FROM maintenance.severe_repair_estimates
        WHERE unit_id = $1
          AND operating_company_id = $2
          AND estimate_status IN ('open', 'awaiting_approval', 'approved')
      `,
      [input.unit_id, input.operating_company_id]
    );
    const openCount = Number(stillOpen.rows[0]?.ct ?? 0);
    if (openCount > 0) {
      throw new Error(`E_OPEN_ESTIMATES: cannot return to service while ${openCount} open severe-repair estimate(s) exist`);
    }

    const res = await client.query<{ id: string; unit_number: string }>(
      `
        UPDATE mdata.units
        SET is_oos = false,
            oos_since = NULL,
            oos_reason = NULL,
            oos_location = NULL
        WHERE id = $1
          AND COALESCE(currently_leased_to_company_id, owner_company_id) = $2::uuid
          AND is_oos = true
        RETURNING id, unit_number
      `,
      [input.unit_id, input.operating_company_id]
    );
    if (res.rows.length === 0) throw new Error("E_NOT_FOUND_OR_NOT_OOS");

    await appendCrudAudit(
      client,
      userId,
      "maintenance.unit.returned_to_service",
      {
        resource_type: "mdata.units",
        resource_id: res.rows[0].id,
        operating_company_id: input.operating_company_id,
        unit_number: res.rows[0].unit_number,
        review_notes: input.review_notes.trim(),
      },
      "info",
      "P5-E5-OOS"
    );

    return { unit_id: res.rows[0].id };
  });
}

export async function refreshEstimate(userId: string, estimate_id: string, operating_company_id: string) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operating_company_id]);

    const updated = await client.query<{ id: string; estimated_total_cents: number }>(
      `
        WITH calc AS (
          SELECT
            e.id AS estimate_id,
            COALESCE(SUM(ROUND(CASE WHEN wl.line_type = 'labor' THEN COALESCE(wl.amount, 0) ELSE 0 END * 100)), 0)::bigint AS labor_cents,
            COALESCE(SUM(ROUND(CASE WHEN wl.line_type = 'parts' THEN COALESCE(wl.amount, 0) ELSE 0 END * 100)), 0)::bigint AS parts_cents,
            COALESCE(SUM(ROUND(CASE WHEN wl.line_type NOT IN ('labor', 'parts') THEN COALESCE(wl.amount, 0) ELSE 0 END * 100)), 0)::bigint AS outside_cents
          FROM maintenance.severe_repair_estimates e
          JOIN maintenance.work_orders w ON w.id = e.trigger_wo_id
          LEFT JOIN maintenance.work_order_lines wl ON wl.work_order_id = w.id
          WHERE e.id = $1
            AND e.operating_company_id = $2
          GROUP BY e.id
        )
        UPDATE maintenance.severe_repair_estimates e
        SET estimated_labor_cents = calc.labor_cents,
            estimated_parts_cents = calc.parts_cents,
            estimated_outside_service_cents = calc.outside_cents,
            refreshed_at = now(),
            updated_at = now()
        FROM calc
        WHERE e.id = calc.estimate_id
        RETURNING e.id, e.estimated_total_cents
      `,
      [estimate_id, operating_company_id]
    );
    if (updated.rows.length === 0) throw new Error("E_NOT_FOUND");

    await appendCrudAudit(
      client,
      userId,
      "maintenance.severe_repair.estimate_generated",
      {
        resource_type: "maintenance.severe_repair_estimates",
        resource_id: updated.rows[0].id,
        operating_company_id,
        new_total_cents: updated.rows[0].estimated_total_cents,
      },
      "info",
      "P5-E5-OOS"
    );

    return updated.rows[0];
  });
}
