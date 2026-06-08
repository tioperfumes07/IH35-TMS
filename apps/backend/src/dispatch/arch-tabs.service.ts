import { withCurrentUser } from "../auth/db.js";

export async function listAtRiskLoads(userId: string, operatingCompanyId: string) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const res = await client.query(
      `
        SELECT
          l.id,
          l.load_number,
          l.status,
          c.customer_name,
          u.unit_number,
          CONCAT_WS(' ', d.first_name, d.last_name) AS driver_name,
          l.latest_eta_prediction,
          sp.scheduled_arrival_at AS next_stop_scheduled_at,
          sd.city AS delivery_city,
          sd.state AS delivery_state
        FROM views.dispatch_load_with_driver_status l
        JOIN mdata.customers c ON c.id = l.customer_id
        LEFT JOIN mdata.units u ON u.id = l.assigned_unit_id
        LEFT JOIN mdata.drivers d ON d.id = l.assigned_primary_driver_id
        LEFT JOIN LATERAL (
          SELECT scheduled_arrival_at, city, state
          FROM mdata.load_stops
          WHERE load_id = l.id AND stop_type = 'delivery'
          ORDER BY sequence_number DESC
          LIMIT 1
        ) sd ON true
        LEFT JOIN LATERAL (
          SELECT scheduled_arrival_at
          FROM mdata.load_stops
          WHERE load_id = l.id
            AND scheduled_arrival_at IS NOT NULL
            AND scheduled_arrival_at >= now()
          ORDER BY scheduled_arrival_at ASC
          LIMIT 1
        ) sp ON true
        WHERE l.operating_company_id = $1
          AND l.soft_deleted_at IS NULL
          AND l.status = 'in_transit'
          AND (
            COALESCE(l.latest_eta_prediction->>'confidence_class', '') IN ('late_risk', 'late')
            OR (
              l.latest_eta_prediction->>'predicted_arrival_at' IS NOT NULL
              AND (l.latest_eta_prediction->>'predicted_arrival_at')::timestamptz <= now() + interval '2 hours'
              AND COALESCE(l.latest_eta_prediction->>'confidence_class', '') <> 'on_time'
            )
            OR (sp.scheduled_arrival_at IS NOT NULL AND sp.scheduled_arrival_at <= now())
          )
        ORDER BY sp.scheduled_arrival_at NULLS LAST, l.created_at DESC
        LIMIT 100
      `,
      [operatingCompanyId]
    );
    return { loads: res.rows };
  });
}

export async function listIntransitIssues(userId: string, operatingCompanyId: string, status?: string) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const values: unknown[] = [operatingCompanyId];
    let statusFilter = "";
    if (status) {
      values.push(status);
      statusFilter = `AND i.status = $${values.length}`;
    }
    const res = await client.query(
      `
        SELECT
          i.id,
          i.load_id,
          i.driver_id,
          i.unit_id,
          i.issue_category,
          i.issue_description,
          i.severity,
          i.status,
          i.reported_at,
          l.load_number,
          u.unit_number,
          CONCAT_WS(' ', d.first_name, d.last_name) AS driver_name
        FROM dispatch.intransit_issues i
        LEFT JOIN mdata.loads l ON l.id = i.load_id
        LEFT JOIN mdata.units u ON u.id = i.unit_id
        LEFT JOIN mdata.drivers d ON d.id = i.driver_id
        WHERE l.operating_company_id = $1
          AND l.soft_deleted_at IS NULL
          ${statusFilter}
        ORDER BY i.reported_at DESC
        LIMIT 200
      `,
      values
    );
    return { issues: res.rows };
  });
}

export async function listAssignmentHistoryGlobal(
  userId: string,
  operatingCompanyId: string,
  filters: { driver_id?: string; from?: string; to?: string; reason?: string }
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const values: unknown[] = [operatingCompanyId];
    const clauses: string[] = ["h.operating_company_id = $1"];

    if (filters.driver_id) {
      values.push(filters.driver_id);
      clauses.push(`(h.new_driver_id = $${values.length} OR h.previous_driver_id = $${values.length})`);
    }
    if (filters.from) {
      values.push(filters.from);
      clauses.push(`h.assigned_at::date >= $${values.length}::date`);
    }
    if (filters.to) {
      values.push(filters.to);
      clauses.push(`h.assigned_at::date <= $${values.length}::date`);
    }
    if (filters.reason) {
      values.push(`%${filters.reason}%`);
      clauses.push(`(h.reason_code ILIKE $${values.length} OR h.notes ILIKE $${values.length})`);
    }

    const res = await client.query(
      `
        SELECT
          h.id,
          h.load_id,
          h.assignment_method,
          h.reason_code,
          h.notes,
          h.assigned_at,
          l.load_number,
          CONCAT_WS(' ', pd.first_name, pd.last_name) AS previous_driver_name,
          CONCAT_WS(' ', nd.first_name, nd.last_name) AS new_driver_name,
          pu.unit_number AS previous_unit_number,
          nu.unit_number AS new_unit_number
        FROM dispatch.load_assignment_history h
        JOIN mdata.loads l ON l.id = h.load_id
        LEFT JOIN mdata.drivers pd ON pd.id = h.previous_driver_id
        LEFT JOIN mdata.drivers nd ON nd.id = h.new_driver_id
        LEFT JOIN mdata.units pu ON pu.id = h.previous_unit_id
        LEFT JOIN mdata.units nu ON nu.id = h.new_unit_id
        WHERE ${clauses.join(" AND ")}
        ORDER BY h.assigned_at DESC
        LIMIT 200
      `,
      values
    );
    return { rows: res.rows };
  });
}

export async function resolveIntransitIssue(userId: string, operatingCompanyId: string, issueId: string, notes?: string) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const res = await client.query(
      `
        UPDATE dispatch.intransit_issues i
        SET status = 'resolved', updated_at = now()
        FROM mdata.loads l
        WHERE i.id = $2
          AND i.load_id = l.id
          AND l.operating_company_id = $1
          AND i.status IN ('open', 'acknowledged')
        RETURNING i.id, i.status
      `,
      [operatingCompanyId, issueId]
    );
    const row = res.rows[0];
    if (!row) return { ok: false as const, error: "issue_not_found_or_already_resolved" };
    if (notes?.trim()) {
      await client.query(`UPDATE dispatch.intransit_issues SET issue_description = issue_description || E'\n[Resolved] ' || $2 WHERE id = $1`, [
        issueId,
        notes.trim(),
      ]);
    }
    return { ok: true as const, issue: row };
  });
}

export async function createOfficeIntransitIssue(
  userId: string,
  operatingCompanyId: string,
  body: {
    load_id: string;
    issue_category: string;
    issue_description: string;
    severity: "info" | "warning" | "severe";
    driver_id?: string;
    unit_id?: string;
  }
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const loadRes = await client.query<{ id: string; assigned_unit_id: string | null; assigned_primary_driver_id: string | null }>(
      `SELECT id, assigned_unit_id, assigned_primary_driver_id FROM mdata.loads WHERE id = $1 AND operating_company_id = $2 AND soft_deleted_at IS NULL LIMIT 1`,
      [body.load_id, operatingCompanyId]
    );
    const load = loadRes.rows[0];
    if (!load) return { ok: false as const, error: "load_not_found" };

    const driverId = body.driver_id ?? load.assigned_primary_driver_id;
    const unitId = body.unit_id ?? load.assigned_unit_id;
    if (!driverId || !unitId) return { ok: false as const, error: "load_missing_assignment" };

    const insertRes = await client.query<{ id: string; reported_at: string }>(
      `
        INSERT INTO dispatch.intransit_issues (
          load_id, driver_id, unit_id, issue_category, issue_description, severity, status, reported_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'open', now())
        RETURNING id, reported_at
      `,
      [body.load_id, driverId, unitId, body.issue_category, body.issue_description, body.severity]
    );
    return { ok: true as const, issue: insertRes.rows[0] };
  });
}
