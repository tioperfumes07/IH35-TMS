import type { PoolClient } from "pg";

type DbClient = Pick<PoolClient, "query">;

export type RetentionFeatures = {
  miles_trend_30d_vs_90d_pct: number | null;
  late_arrival_rate_30d: number | null;
  unanswered_outbound_comms_count: number | null;
  safety_score_trend: number | null;
  pay_per_mile_actual_vs_promised: number | null;
  home_time_days_per_month: number | null;
  complaints_logged_count: number | null;
  pm_no_show_count: number | null;
};

async function tableExists(client: DbClient, qualified: string): Promise<boolean> {
  const res = await client.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [qualified]);
  return Boolean(res.rows[0]?.ok);
}

export async function extractRetentionFeatures(
  client: DbClient,
  operatingCompanyId: string,
  driverUuid: string
): Promise<RetentionFeatures> {
  const features: RetentionFeatures = {
    miles_trend_30d_vs_90d_pct: null,
    late_arrival_rate_30d: null,
    unanswered_outbound_comms_count: null,
    safety_score_trend: null,
    pay_per_mile_actual_vs_promised: null,
    home_time_days_per_month: null,
    complaints_logged_count: null,
    pm_no_show_count: null,
  };

  if (await tableExists(client, "mdata.loads")) {
    const miles = await client.query<{ m30: string; m90: string }>(
      // CLS-SCHEMA-DRIFT / PHANTOM COLUMN — prod-verified 2026-08-07: mdata.loads has NO `miles`.
      // The real columns are loaded_miles / miles_practical / miles_shortest / miles_deadhead, so this
      // query threw 42703 and the whole retention feature-extract failed — miles_trend_30d_vs_90d_pct
      // was never merely null, the caller errored. `tableExists` guarded the TABLE, which existed; the
      // column is what was missing, which is exactly the gap the SELECT-list guard now closes.
      // Uses the repo's canonical driver/vehicle-miles fallback chain, identical to
      // accounting/break-even.service.ts:111 and reports/lane-profitability.service.ts:87.
      `
        SELECT
          COALESCE(SUM(COALESCE(loaded_miles, miles_practical, miles_shortest, 0))
                     FILTER (WHERE created_at >= now() - interval '30 days'), 0)::text AS m30,
          COALESCE(SUM(COALESCE(loaded_miles, miles_practical, miles_shortest, 0))
                     FILTER (WHERE created_at >= now() - interval '90 days'), 0)::text AS m90
        FROM mdata.loads
        WHERE operating_company_id = $1::uuid
          AND (assigned_primary_driver_id = $2::uuid OR assigned_secondary_driver_id = $2::uuid)
          AND soft_deleted_at IS NULL
      `,
      [operatingCompanyId, driverUuid]
    );
    const m30 = Number(miles.rows[0]?.m30 ?? 0);
    const m90 = Number(miles.rows[0]?.m90 ?? 0);
    if (m90 > 0) features.miles_trend_30d_vs_90d_pct = ((m30 / (m90 / 3)) - 1) * 100;
  }

  if (await tableExists(client, "dispatch.late_arrival_aggregates")) {
    const late = await client.query<{ rate: string }>(
      `
        SELECT COALESCE(AVG(late_pct), 0)::text AS rate
        FROM dispatch.late_arrival_aggregates
        WHERE operating_company_id = $1::uuid AND driver_uuid = $2::uuid
          AND bucket_date >= (CURRENT_DATE - 30)
      `,
      [operatingCompanyId, driverUuid]
    );
    features.late_arrival_rate_30d = Number(late.rows[0]?.rate ?? 0);
  }

  return features;
}
