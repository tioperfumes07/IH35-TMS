import { setScopedCompanyContext } from "../_helpers/scoped-company-context.js";
import { withCurrentUser } from "../auth/db.js";
import { DISPATCH_ALERT_ACTIVE_STATUSES_SQL } from "./dispatch-alert-statuses.js";

const DEFAULT_LATE_GRACE_MINUTES = 30;

export function lateArrivalGraceMinutes(): number {
  const raw = Number(process.env.DISPATCH_LATE_ARRIVAL_GRACE_MINUTES ?? DEFAULT_LATE_GRACE_MINUTES);
  if (!Number.isFinite(raw) || raw < 0) return DEFAULT_LATE_GRACE_MINUTES;
  return Math.floor(raw);
}

/** Pure helper: ETA after scheduled + grace, or explicit late confidence. */
export function isLateArrivalByEta(input: {
  predicted_arrival_at: string | null | undefined;
  scheduled_arrival_at: string | null | undefined;
  confidence_class?: string | null;
  grace_minutes: number;
  nowMs?: number;
}): boolean {
  if (String(input.confidence_class ?? "") === "late") return true;
  if (!input.scheduled_arrival_at) return false;
  const scheduledMs = new Date(input.scheduled_arrival_at).getTime();
  if (!Number.isFinite(scheduledMs)) return false;
  const graceMs = input.grace_minutes * 60_000;
  const deadlineMs = scheduledMs + graceMs;
  const nowMs = input.nowMs ?? Date.now();
  if (nowMs > deadlineMs) return true;
  if (!input.predicted_arrival_at) return false;
  const predictedMs = new Date(input.predicted_arrival_at).getTime();
  if (!Number.isFinite(predictedMs)) return false;
  return predictedMs > deadlineMs;
}

export async function listLateArrivalLoads(userId: string, operatingCompanyId: string) {
  const graceMinutes = lateArrivalGraceMinutes();
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
          COALESCE(c.customer_name, mdata.resolve_customer_label_same_company(l.customer_id, l.operating_company_id)) AS customer_name,
          u.unit_number,
          COALESCE(
            NULLIF(CONCAT_WS(' ', d.first_name, d.last_name), ''),
            mdata.resolve_driver_label_same_company(l.assigned_primary_driver_id, l.operating_company_id)
          ) AS driver_name,
          l.latest_eta_prediction,
          sp.scheduled_arrival_at AS next_stop_scheduled_at,
          sp.city AS next_stop_city,
          sp.state AS next_stop_state,
          sp.stop_type AS next_stop_type
        FROM views.dispatch_load_with_driver_status l
        LEFT JOIN mdata.customers c ON c.id = l.customer_id
                                   AND c.operating_company_id = l.operating_company_id
        LEFT JOIN mdata.units u ON u.id = l.assigned_unit_id
                               AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = l.operating_company_id
        LEFT JOIN mdata.drivers d ON d.id = l.assigned_primary_driver_id
                                 AND (
                                   d.operating_company_id = l.operating_company_id
                                   OR EXISTS (
                                     SELECT 1
                                     FROM mdata.driver_company_authorizations late_arrivals_list_dca
                                     WHERE late_arrivals_list_dca.driver_id = d.id
                                       AND late_arrivals_list_dca.company_id = l.operating_company_id
                                       AND late_arrivals_list_dca.is_authorized = true
                                       AND late_arrivals_list_dca.deactivated_at IS NULL
                                   )
                                 )
        LEFT JOIN LATERAL (
          SELECT scheduled_arrival_at, city, state, stop_type::text AS stop_type
          FROM mdata.load_stops
          WHERE load_id = l.id
            AND soft_deleted_at IS NULL
            AND scheduled_arrival_at IS NOT NULL
            AND COALESCE(actual_arrival_at, actual_departure_at) IS NULL
          ORDER BY scheduled_arrival_at ASC
          LIMIT 1
        ) sp ON true
        WHERE l.operating_company_id = $1::uuid
          AND l.soft_deleted_at IS NULL
          AND EXISTS (
            SELECT 1
            FROM mdata.loads sample_load
            WHERE sample_load.id = l.id
              AND sample_load.is_sample_data IS NOT TRUE
          )
          AND l.status IN (${DISPATCH_ALERT_ACTIVE_STATUSES_SQL})
          AND sp.scheduled_arrival_at IS NOT NULL
          AND (
            COALESCE(l.latest_eta_prediction->>'confidence_class', '') = 'late'
            OR (
              l.latest_eta_prediction->>'predicted_arrival_at' IS NOT NULL
              AND (l.latest_eta_prediction->>'predicted_arrival_at')::timestamptz
                > sp.scheduled_arrival_at + ($2::int * interval '1 minute')
            )
            OR sp.scheduled_arrival_at + ($2::int * interval '1 minute') < now()
          )
        ORDER BY sp.scheduled_arrival_at ASC, l.created_at DESC
      `,
      [operatingCompanyId, graceMinutes]
    );
    return {
      count: res.rows.length,
      grace_minutes: graceMinutes,
      loads: res.rows,
    };
  });
}
