import type { PoolClient } from "pg";

type DbClient = Pick<PoolClient, "query">;

export type RelationshipTier = "thriving" | "healthy" | "watch" | "at_risk";

export interface RelationshipScoreSubscores {
  engagement_subscore: number | null;
  payment_behavior_subscore: number | null;
  service_quality_subscore: number | null;
  margin_trend_subscore: number | null;
  complaint_subscore: number | null;
}

export interface RelationshipScoreResult extends RelationshipScoreSubscores {
  customer_uuid: string;
  operating_company_id: string;
  computed_at: string;
  overall_health_score: number;
  health_tier: RelationshipTier;
}

const SUBSCORE_WEIGHTS = {
  engagement_subscore: 0.25,
  payment_behavior_subscore: 0.3,
  service_quality_subscore: 0.25,
  margin_trend_subscore: 0.1,
  complaint_subscore: 0.1,
} as const;

function clamp(input: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, input));
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

async function tableExists(client: DbClient, schema: string, table: string): Promise<boolean> {
  const res = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2 LIMIT 1`,
    [schema, table]
  );
  return (res.rowCount ?? 0) > 0;
}

function normalizeInverse(raw: number, worstAtOrAbove: number): number {
  if (!Number.isFinite(raw)) return 0;
  if (worstAtOrAbove <= 0) return 100;
  return clamp(round2(100 - (raw / worstAtOrAbove) * 100), 0, 100);
}

function normalizeLinear(raw: number, min: number, max: number): number {
  if (!Number.isFinite(raw)) return 0;
  if (max <= min) return 0;
  const pct = ((raw - min) / (max - min)) * 100;
  return clamp(round2(pct), 0, 100);
}

export function tierFromOverallScore(score: number): RelationshipTier {
  if (score >= 85) return "thriving";
  if (score >= 65) return "healthy";
  if (score >= 45) return "watch";
  return "at_risk";
}

export function computeWeightedOverallScore(subscores: RelationshipScoreSubscores): number {
  let weightedSum = 0;
  let weightTotal = 0;
  for (const [key, weight] of Object.entries(SUBSCORE_WEIGHTS) as Array<
    [keyof RelationshipScoreSubscores, number]
  >) {
    const score = subscores[key];
    if (typeof score === "number" && Number.isFinite(score)) {
      weightedSum += score * weight;
      weightTotal += weight;
    }
  }
  if (weightTotal <= 0) return 0;
  return round2(weightedSum / weightTotal);
}

async function computeEngagementSubscore(
  client: DbClient,
  operatingCompanyId: string,
  customerUuid: string
): Promise<number | null> {
  const hasLoads = await tableExists(client, "mdata", "loads");
  if (!hasLoads) return null;

  const res = await client.query<{ loads_30d: string; loads_90d: string }>(
    `
      SELECT
        COUNT(*) FILTER (WHERE created_at >= now() - interval '30 days')::int::text AS loads_30d,
        COUNT(*) FILTER (WHERE created_at >= now() - interval '90 days')::int::text AS loads_90d
      FROM mdata.loads
      WHERE operating_company_id = $1::uuid
        AND customer_id = $2::uuid
        AND soft_deleted_at IS NULL
    `,
    [operatingCompanyId, customerUuid]
  );

  const loads30 = Number(res.rows[0]?.loads_30d ?? 0);
  const loads90 = Number(res.rows[0]?.loads_90d ?? 0);
  if (loads90 <= 0) return null;

  // Relative activity versus trailing baseline (90d / 3) as a 0..100 score.
  const baseline30 = Math.max(loads90 / 3, 1);
  return normalizeLinear(loads30 / baseline30, 0, 1);
}

async function computePaymentBehaviorSubscore(
  client: DbClient,
  operatingCompanyId: string,
  customerUuid: string
): Promise<number | null> {
  const hasInvoices = await tableExists(client, "accounting", "invoices");
  if (!hasInvoices) return null;

  const res = await client.query<{ weighted_days: string; open_cents: string }>(
    `
      SELECT
        COALESCE(
          SUM(
            GREATEST(EXTRACT(DAY FROM (current_date - i.issue_date)), 0) * i.amount_open_cents
          ),
          0
        )::numeric::text AS weighted_days,
        COALESCE(SUM(i.amount_open_cents), 0)::numeric::text AS open_cents
      FROM accounting.invoices i
      WHERE i.operating_company_id = $1::uuid
        AND i.customer_id = $2::uuid
        AND i.status IN ('sent', 'partial')
        AND i.issue_date >= current_date - interval '120 days'
        AND i.voided_at IS NULL
    `,
    [operatingCompanyId, customerUuid]
  );

  const weightedDays = Number(res.rows[0]?.weighted_days ?? 0);
  const openCents = Number(res.rows[0]?.open_cents ?? 0);
  if (openCents <= 0) return 100;

  const dsoDays = weightedDays / openCents;
  return normalizeInverse(dsoDays, 60);
}

async function computeServiceQualitySubscore(
  client: DbClient,
  operatingCompanyId: string,
  customerUuid: string
): Promise<number | null> {
  const hasStopArrivals = await tableExists(client, "dispatch", "stop_arrivals");
  const hasLoadStops = await tableExists(client, "mdata", "load_stops");
  const hasLoads = await tableExists(client, "mdata", "loads");
  if (!hasStopArrivals || !hasLoadStops || !hasLoads) return null;

  const res = await client.query<{ total_count: string; late_count: string }>(
    `
      WITH completed AS (
        SELECT
          COALESCE(sa.confirmed_at, sa.triggered_at) AS arrived_at,
          COALESCE(ls.appointment_end_at, ls.scheduled_arrival_at, ls.appointment_start_at) AS scheduled_at
        FROM dispatch.stop_arrivals sa
        JOIN mdata.load_stops ls ON ls.id = sa.stop_id
        JOIN mdata.loads l ON l.id = ls.load_id
        WHERE sa.operating_company_id = $1::uuid
          AND l.operating_company_id = $1::uuid
          AND l.customer_id = $2::uuid
          AND l.soft_deleted_at IS NULL
          AND COALESCE(sa.confirmed_at, sa.triggered_at) >= now() - interval '30 days'
          AND COALESCE(ls.appointment_end_at, ls.scheduled_arrival_at, ls.appointment_start_at) IS NOT NULL
      )
      SELECT
        COUNT(*)::int::text AS total_count,
        COUNT(*) FILTER (
          WHERE arrived_at > scheduled_at + interval '30 minutes'
        )::int::text AS late_count
      FROM completed
    `,
    [operatingCompanyId, customerUuid]
  );

  const totalCount = Number(res.rows[0]?.total_count ?? 0);
  const lateCount = Number(res.rows[0]?.late_count ?? 0);
  if (totalCount <= 0) return null;
  const latePct = lateCount / totalCount;
  return clamp(round2(100 - latePct * 100), 0, 100);
}

async function computeMarginTrendSubscore(
  client: DbClient,
  operatingCompanyId: string,
  customerUuid: string
): Promise<number | null> {
  const hasLoads = await tableExists(client, "mdata", "loads");
  if (!hasLoads) return null;

  const res = await client.query<{
    revenue_30: string;
    miles_30: string;
    revenue_180: string;
    miles_180: string;
  }>(
    `
      SELECT
        COALESCE(SUM(rate_total_cents) FILTER (WHERE created_at >= now() - interval '30 days'), 0)::numeric::text AS revenue_30,
        COALESCE(
          SUM(COALESCE(loaded_miles, miles_practical, miles_shortest, 0))
          FILTER (WHERE created_at >= now() - interval '30 days'),
          0
        )::numeric::text AS miles_30,
        COALESCE(SUM(rate_total_cents) FILTER (WHERE created_at >= now() - interval '180 days'), 0)::numeric::text AS revenue_180,
        COALESCE(
          SUM(COALESCE(loaded_miles, miles_practical, miles_shortest, 0))
          FILTER (WHERE created_at >= now() - interval '180 days'),
          0
        )::numeric::text AS miles_180
      FROM mdata.loads
      WHERE operating_company_id = $1::uuid
        AND customer_id = $2::uuid
        AND soft_deleted_at IS NULL
        AND status::text <> 'cancelled'
    `,
    [operatingCompanyId, customerUuid]
  );

  const revenue30 = Number(res.rows[0]?.revenue_30 ?? 0);
  const miles30 = Number(res.rows[0]?.miles_30 ?? 0);
  const revenue180 = Number(res.rows[0]?.revenue_180 ?? 0);
  const miles180 = Number(res.rows[0]?.miles_180 ?? 0);
  if (miles30 <= 0 || miles180 <= 0) return null;

  const rpm30 = revenue30 / miles30;
  const rpm180 = revenue180 / miles180;
  if (!Number.isFinite(rpm30) || !Number.isFinite(rpm180) || rpm180 <= 0) return null;

  const trendPct = ((rpm30 - rpm180) / rpm180) * 100;
  return clamp(round2(50 + trendPct * 2.5), 0, 100);
}

async function computeComplaintSubscore(
  client: DbClient,
  customerUuid: string
): Promise<number | null> {
  const hasQualityEvents = await tableExists(client, "mdata", "customer_quality_events");
  if (!hasQualityEvents) return null;

  const res = await client.query<{ complaint_count: string }>(
    `
      SELECT
        COUNT(*) FILTER (
          WHERE event_type <> 'commendation'
            AND voided_at IS NULL
            AND event_date >= current_date - interval '30 days'
        )::int::text AS complaint_count
      FROM mdata.customer_quality_events
      WHERE customer_id = $1::uuid
    `,
    [customerUuid]
  );

  const complaintCount = Number(res.rows[0]?.complaint_count ?? 0);
  return clamp(round2(100 - complaintCount * 10), 0, 100);
}

export async function computeRelationshipScore(
  client: DbClient,
  input: { operating_company_id: string; customer_uuid: string }
): Promise<RelationshipScoreResult> {
  const engagement_subscore = await computeEngagementSubscore(
    client,
    input.operating_company_id,
    input.customer_uuid
  );
  const payment_behavior_subscore = await computePaymentBehaviorSubscore(
    client,
    input.operating_company_id,
    input.customer_uuid
  );
  const service_quality_subscore = await computeServiceQualitySubscore(
    client,
    input.operating_company_id,
    input.customer_uuid
  );
  const margin_trend_subscore = await computeMarginTrendSubscore(
    client,
    input.operating_company_id,
    input.customer_uuid
  );
  const complaint_subscore = await computeComplaintSubscore(client, input.customer_uuid);

  const overall_health_score = computeWeightedOverallScore({
    engagement_subscore,
    payment_behavior_subscore,
    service_quality_subscore,
    margin_trend_subscore,
    complaint_subscore,
  });

  return {
    customer_uuid: input.customer_uuid,
    operating_company_id: input.operating_company_id,
    computed_at: new Date().toISOString(),
    overall_health_score,
    health_tier: tierFromOverallScore(overall_health_score),
    engagement_subscore,
    payment_behavior_subscore,
    service_quality_subscore,
    margin_trend_subscore,
    complaint_subscore,
  };
}

export async function upsertRelationshipScore(
  client: DbClient,
  score: RelationshipScoreResult
): Promise<RelationshipScoreResult> {
  const res = await client.query<RelationshipScoreResult>(
    `
      INSERT INTO master_data.customer_relationship_scores (
        customer_uuid,
        operating_company_id,
        computed_at,
        overall_health_score,
        health_tier,
        engagement_subscore,
        payment_behavior_subscore,
        service_quality_subscore,
        margin_trend_subscore,
        complaint_subscore,
        updated_at
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        now(),
        $3::numeric,
        $4::text,
        $5::numeric,
        $6::numeric,
        $7::numeric,
        $8::numeric,
        $9::numeric,
        now()
      )
      ON CONFLICT (customer_uuid) DO UPDATE SET
        operating_company_id = EXCLUDED.operating_company_id,
        computed_at = now(),
        overall_health_score = EXCLUDED.overall_health_score,
        health_tier = EXCLUDED.health_tier,
        engagement_subscore = EXCLUDED.engagement_subscore,
        payment_behavior_subscore = EXCLUDED.payment_behavior_subscore,
        service_quality_subscore = EXCLUDED.service_quality_subscore,
        margin_trend_subscore = EXCLUDED.margin_trend_subscore,
        complaint_subscore = EXCLUDED.complaint_subscore,
        updated_at = now()
      RETURNING
        customer_uuid::text,
        operating_company_id::text,
        computed_at::text,
        overall_health_score::float8 AS overall_health_score,
        health_tier,
        engagement_subscore::float8 AS engagement_subscore,
        payment_behavior_subscore::float8 AS payment_behavior_subscore,
        service_quality_subscore::float8 AS service_quality_subscore,
        margin_trend_subscore::float8 AS margin_trend_subscore,
        complaint_subscore::float8 AS complaint_subscore
    `,
    [
      score.customer_uuid,
      score.operating_company_id,
      score.overall_health_score,
      score.health_tier,
      score.engagement_subscore,
      score.payment_behavior_subscore,
      score.service_quality_subscore,
      score.margin_trend_subscore,
      score.complaint_subscore,
    ]
  );
  return res.rows[0] ?? score;
}

export async function listAtRiskRelationshipScores(
  client: DbClient,
  operatingCompanyId: string,
  limit: number
): Promise<
  Array<{
    customer_uuid: string;
    customer_name: string;
    customer_code: string | null;
    overall_health_score: number;
    health_tier: RelationshipTier;
    computed_at: string;
  }>
> {
  const hasRelationshipScores = await tableExists(client, "master_data", "customer_relationship_scores");
  if (!hasRelationshipScores) return [];

  const res = await client.query<{
    customer_uuid: string;
    customer_name: string;
    customer_code: string | null;
    overall_health_score: number;
    health_tier: RelationshipTier;
    computed_at: string;
  }>(
    `
      SELECT
        s.customer_uuid::text,
        c.customer_name,
        c.customer_code,
        s.overall_health_score::float8 AS overall_health_score,
        s.health_tier,
        s.computed_at::text
      FROM master_data.customer_relationship_scores s
      JOIN mdata.customers c ON c.id = s.customer_uuid
      WHERE s.operating_company_id = $1::uuid
        AND s.health_tier = 'at_risk'
        AND c.deactivated_at IS NULL
      ORDER BY s.overall_health_score ASC, c.customer_name ASC
      LIMIT $2::int
    `,
    [operatingCompanyId, limit]
  );

  return res.rows;
}
