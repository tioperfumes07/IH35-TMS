import { setScopedCompanyContext } from "../_helpers/scoped-company-context.js";
import { withCurrentUser } from "../auth/db.js";

export async function listAtRiskLoads(userId: string, operatingCompanyId: string) {
  return withCurrentUser(userId, async (client) => {
    await setScopedCompanyContext(client, userId, operatingCompanyId);
    const res = await client.query(
      `
        SELECT
          l.id,
          l.load_number,
          l.status,
          l.customer_id,
          l.assigned_unit_id AS unit_id,
          l.assigned_primary_driver_id AS driver_id,
          c.customer_name,
          u.unit_number,
          CONCAT_WS(' ', d.first_name, d.last_name) AS driver_name,
          l.latest_eta_prediction,
          sp.scheduled_arrival_at AS next_stop_scheduled_at,
          sd.city AS delivery_city,
          sd.state AS delivery_state
        FROM views.dispatch_load_with_driver_status l
        JOIN mdata.customers c ON c.id = l.customer_id
                              AND c.operating_company_id = l.operating_company_id
        LEFT JOIN mdata.units u ON u.id = l.assigned_unit_id
                               AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = l.operating_company_id
        LEFT JOIN mdata.drivers d ON d.id = l.assigned_primary_driver_id
                                 AND (
                                   d.operating_company_id = l.operating_company_id
                                   OR EXISTS (
                                     SELECT 1
                                     FROM mdata.driver_company_authorizations at_risk_driver_dca
                                     WHERE at_risk_driver_dca.driver_id = d.id
                                       AND at_risk_driver_dca.company_id = l.operating_company_id
                                       AND at_risk_driver_dca.is_authorized = true
                                       AND at_risk_driver_dca.deactivated_at IS NULL
                                   )
                                 )
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
        WHERE l.operating_company_id = $1::uuid
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
      `,
      [operatingCompanyId]
    );
    return { loads: res.rows };
  });
}

export async function listIntransitIssues(
  userId: string,
  operatingCompanyId: string,
  filters: { status?: string; issue_id?: string; load_id?: string; driver_id?: string; unit_id?: string } = {}
) {
  return withCurrentUser(userId, async (client) => {
    await setScopedCompanyContext(client, userId, operatingCompanyId);
    const values: unknown[] = [operatingCompanyId];
    const clauses = ["i.operating_company_id = $1::uuid", "l.operating_company_id = $1::uuid", "l.soft_deleted_at IS NULL"];
    if (filters.status) {
      values.push(filters.status);
      clauses.push(`i.status = $${values.length}`);
    }
    if (filters.issue_id) {
      values.push(filters.issue_id);
      clauses.push(`i.id = $${values.length}::uuid`);
    }
    if (filters.load_id) {
      values.push(filters.load_id);
      clauses.push(`i.load_id = $${values.length}::uuid`);
    }
    if (filters.driver_id) {
      values.push(filters.driver_id);
      clauses.push(`i.driver_id = $${values.length}::uuid`);
    }
    if (filters.unit_id) {
      values.push(filters.unit_id);
      clauses.push(`i.unit_id = $${values.length}::uuid`);
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
                               AND l.operating_company_id = i.operating_company_id
        LEFT JOIN mdata.units u ON u.id = i.unit_id
                               AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = i.operating_company_id
        LEFT JOIN mdata.drivers d ON d.id = i.driver_id
                                 AND (
                                   d.operating_company_id = i.operating_company_id
                                   OR EXISTS (
                                     SELECT 1
                                     FROM mdata.driver_company_authorizations intransit_issue_driver_dca
                                     WHERE intransit_issue_driver_dca.driver_id = d.id
                                       AND intransit_issue_driver_dca.company_id = i.operating_company_id
                                       AND intransit_issue_driver_dca.is_authorized = true
                                       AND intransit_issue_driver_dca.deactivated_at IS NULL
                                   )
                                 )
        WHERE ${clauses.join(" AND ")}
        ORDER BY i.reported_at DESC
      `,
      values
    );
    return { issues: res.rows };
  });
}

export async function listAssignmentHistoryGlobal(
  userId: string,
  operatingCompanyId: string,
  filters: { driver_id?: string; from?: string; to?: string; reason?: string; limit: number; offset: number }
) {
  return withCurrentUser(userId, async (client) => {
    await setScopedCompanyContext(client, userId, operatingCompanyId);
    const values: unknown[] = [operatingCompanyId];
    const clauses: string[] = ["h.operating_company_id = $1::uuid"];

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

    const countRes = await client.query(
      `SELECT count(*)::int AS total_count
       FROM dispatch.load_assignment_history h
       JOIN mdata.loads l ON l.id = h.load_id AND l.operating_company_id = $1::uuid
       WHERE ${clauses.join(" AND ")}`,
      values
    );
    values.push(filters.limit, filters.offset);
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
          h.previous_driver_id,
          h.new_driver_id,
          h.previous_unit_id,
          h.new_unit_id,
          CONCAT_WS(' ', pd.first_name, pd.last_name) AS previous_driver_name,
          CONCAT_WS(' ', nd.first_name, nd.last_name) AS new_driver_name,
          pu.unit_number AS previous_unit_number,
          nu.unit_number AS new_unit_number
        FROM dispatch.load_assignment_history h
        JOIN mdata.loads l ON l.id = h.load_id AND l.operating_company_id = $1::uuid
        LEFT JOIN mdata.drivers pd ON pd.id = h.previous_driver_id
                                  AND (
                                    pd.operating_company_id = l.operating_company_id
                                    OR EXISTS (
                                      SELECT 1
                                      FROM mdata.driver_company_authorizations assignment_previous_driver_dca
                                      WHERE assignment_previous_driver_dca.driver_id = pd.id
                                        AND assignment_previous_driver_dca.company_id = l.operating_company_id
                                        AND assignment_previous_driver_dca.is_authorized = true
                                        AND assignment_previous_driver_dca.deactivated_at IS NULL
                                    )
                                  )
        LEFT JOIN mdata.drivers nd ON nd.id = h.new_driver_id
                                  AND (
                                    nd.operating_company_id = l.operating_company_id
                                    OR EXISTS (
                                      SELECT 1
                                      FROM mdata.driver_company_authorizations assignment_new_driver_dca
                                      WHERE assignment_new_driver_dca.driver_id = nd.id
                                        AND assignment_new_driver_dca.company_id = l.operating_company_id
                                        AND assignment_new_driver_dca.is_authorized = true
                                        AND assignment_new_driver_dca.deactivated_at IS NULL
                                    )
                                  )
        LEFT JOIN mdata.units pu ON pu.id = h.previous_unit_id
                                AND COALESCE(pu.currently_leased_to_company_id, pu.owner_company_id) = l.operating_company_id
        LEFT JOIN mdata.units nu ON nu.id = h.new_unit_id
                                AND COALESCE(nu.currently_leased_to_company_id, nu.owner_company_id) = l.operating_company_id
        WHERE ${clauses.join(" AND ")}
        ORDER BY h.assigned_at DESC
        LIMIT $${values.length - 1} OFFSET $${values.length}
      `,
      values
    );
    return { rows: res.rows, total_count: Number(countRes.rows[0]?.total_count ?? 0) };
  });
}

export async function resolveIntransitIssue(userId: string, operatingCompanyId: string, issueId: string, notes?: string) {
  return withCurrentUser(userId, async (client) => {
    await setScopedCompanyContext(client, userId, operatingCompanyId);
    const res = await client.query(
      `
        UPDATE dispatch.intransit_issues i
        SET status = 'resolved',
            issue_description = CASE
              WHEN NULLIF(BTRIM($3::text), '') IS NULL THEN i.issue_description
              ELSE i.issue_description || E'\n[Resolved] ' || BTRIM($3::text)
            END,
            updated_at = now()
        FROM mdata.loads l
        WHERE i.id = $2
          AND i.operating_company_id = $1::uuid
          AND i.load_id = l.id
          AND l.operating_company_id = $1::uuid
          AND i.status IN ('open', 'acknowledged')
        RETURNING i.id, i.status
      `,
      [operatingCompanyId, issueId, notes ?? null]
    );
    const row = res.rows[0];
    if (!row) return { ok: false as const, error: "issue_not_found_or_already_resolved" };
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
    await setScopedCompanyContext(client, userId, operatingCompanyId);
    const loadRes = await client.query<{ id: string; assigned_unit_id: string | null; assigned_primary_driver_id: string | null; assigned_secondary_driver_id: string | null }>(
      `SELECT id, assigned_unit_id, assigned_primary_driver_id, assigned_secondary_driver_id FROM mdata.loads WHERE id = $1 AND operating_company_id = $2::uuid AND soft_deleted_at IS NULL LIMIT 1`,
      [body.load_id, operatingCompanyId]
    );
    const load = loadRes.rows[0];
    if (!load) return { ok: false as const, error: "load_not_found" };

    const assignedDriverIds = [load.assigned_primary_driver_id, load.assigned_secondary_driver_id].filter(Boolean);
    if (body.driver_id && !assignedDriverIds.includes(body.driver_id)) {
      return { ok: false as const, error: "driver_not_assigned_to_load" as const };
    }
    if (body.unit_id && body.unit_id !== load.assigned_unit_id) {
      return { ok: false as const, error: "unit_not_assigned_to_load" as const };
    }

    const driverId = body.driver_id ?? load.assigned_primary_driver_id;
    const unitId = body.unit_id ?? load.assigned_unit_id;
    if (!driverId || !unitId) return { ok: false as const, error: "load_missing_assignment" };

    const insertRes = await client.query<{ id: string; reported_at: string }>(
      `
        INSERT INTO dispatch.intransit_issues (
          operating_company_id, load_id, driver_id, unit_id, issue_category, issue_description, severity, status, reported_at
        )
        VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, 'open', now())
        RETURNING id, reported_at
      `,
      [operatingCompanyId, body.load_id, driverId, unitId, body.issue_category, body.issue_description, body.severity]
    );
    const issue = insertRes.rows[0];
    if (!issue) return { ok: false as const, error: "create_failed" as const };
    return { ok: true as const, issue };
  });
}
