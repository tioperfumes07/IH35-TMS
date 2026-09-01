/**
 * GO-07 LOADS drill projections — shared by at-risk-loads and late-arrivals.
 * Pickup alias is `pk`; delivery alias is `sd`; next/promised alias is `sp`.
 */
export const KPI_LOAD_DRILL_SELECT = `
          ml.customer_wo_number,
          pk.city AS origin_city,
          pk.state AS origin_state,
          pk.scheduled_arrival_at AS pickup_at,
          sd.scheduled_arrival_at AS delivery_at,
          ml.loaded_miles,
          ml.rate_total_cents,
          CASE WHEN COALESCE(ml.loaded_miles, 0) > 0
            THEN ROUND((ml.rate_total_cents::numeric / 100.0) / ml.loaded_miles, 4)
            ELSE NULL END AS rpm,
          inv.invoice_status,
          CASE
            WHEN COALESCE(l.latest_eta_prediction->>'confidence_class', '') IN ('late', 'late_risk')
              THEN l.latest_eta_prediction->>'confidence_class'
            WHEN sp.scheduled_arrival_at IS NOT NULL AND sp.scheduled_arrival_at <= now() THEN 'promised_passed'
            ELSE 'eta_window'
          END AS risk_reason,
          GREATEST(0, EXTRACT(EPOCH FROM (now() - COALESCE(sd.scheduled_arrival_at, sp.scheduled_arrival_at))) / 3600.0) AS hours_over,
          COALESCE(sd.scheduled_arrival_at, sp.scheduled_arrival_at) AS promised_at
`;

export const KPI_LOAD_DRILL_JOINS = `
        LEFT JOIN mdata.loads ml ON ml.id = l.id
                               AND ml.operating_company_id = l.operating_company_id
        LEFT JOIN LATERAL (
          SELECT city, state, scheduled_arrival_at
          FROM mdata.load_stops
          WHERE load_id = l.id AND stop_type = 'pickup'
            AND soft_deleted_at IS NULL
          ORDER BY sequence_number ASC
          LIMIT 1
        ) pk ON true
        LEFT JOIN LATERAL (
          SELECT i.status AS invoice_status
          FROM accounting.invoices i
          WHERE i.source_load_id = l.id
            AND i.operating_company_id = l.operating_company_id
            AND i.status <> 'void'
          ORDER BY i.issue_date DESC, i.created_at DESC
          LIMIT 1
        ) inv ON true
`;
