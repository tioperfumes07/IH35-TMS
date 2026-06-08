import type { PoolClient } from "pg";
import { extractRetentionFeatures, type RetentionFeatures } from "./feature-extractor.js";

type DbClient = Pick<PoolClient, "query">;

export type RetentionTier = "stable" | "watch" | "at_risk" | "critical";

export type RetentionScoreResult = {
  operating_company_id: string;
  driver_uuid: string;
  computed_at: string;
  retention_risk_score: number;
  retention_tier: RetentionTier;
  contributing_factors: RetentionFeatures;
};

const WEIGHTS = {
  miles_trend_30d_vs_90d_pct: 0.2,
  late_arrival_rate_30d: 0.15,
  unanswered_outbound_comms_count: 0.1,
  safety_score_trend: 0.15,
  pay_per_mile_actual_vs_promised: 0.15,
  home_time_days_per_month: 0.1,
  complaints_logged_count: 0.1,
  pm_no_show_count: 0.05,
} as const;

function clamp(n: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, n));
}

export function tierFromRiskScore(score: number): RetentionTier {
  if (score >= 75) return "critical";
  if (score >= 55) return "at_risk";
  if (score >= 35) return "watch";
  return "stable";
}

export function scoreFeatures(features: RetentionFeatures): number {
  let weighted = 0;
  let totalWeight = 0;
  for (const [key, weight] of Object.entries(WEIGHTS) as Array<[keyof RetentionFeatures, number]>) {
    const raw = features[key];
    if (raw == null || !Number.isFinite(raw)) continue;
    let partial = 0;
    if (key === "miles_trend_30d_vs_90d_pct") partial = clamp(50 - raw);
    else if (key === "late_arrival_rate_30d") partial = clamp(raw * 100);
    else if (key === "home_time_days_per_month") partial = clamp(100 - raw * 10);
    else partial = clamp(raw * 10);
    weighted += partial * weight;
    totalWeight += weight;
  }
  if (totalWeight <= 0) return 25;
  return clamp(Number((weighted / totalWeight).toFixed(2)));
}

export async function computeRetentionScore(
  client: DbClient,
  operatingCompanyId: string,
  driverUuid: string
): Promise<RetentionScoreResult> {
  const features = await extractRetentionFeatures(client, operatingCompanyId, driverUuid);
  const retention_risk_score = scoreFeatures(features);
  return {
    operating_company_id: operatingCompanyId,
    driver_uuid: driverUuid,
    computed_at: new Date().toISOString(),
    retention_risk_score,
    retention_tier: tierFromRiskScore(retention_risk_score),
    contributing_factors: features,
  };
}

export async function upsertRetentionScore(client: DbClient, score: RetentionScoreResult) {
  await client.query(
    `
      INSERT INTO drivers.retention_scores (
        operating_company_id, driver_uuid, computed_at,
        retention_risk_score, retention_tier, contributing_factors
      ) VALUES ($1::uuid, $2::uuid, $3::timestamptz, $4, $5, $6::jsonb)
    `,
    [
      score.operating_company_id,
      score.driver_uuid,
      score.computed_at,
      score.retention_risk_score,
      score.retention_tier,
      JSON.stringify(score.contributing_factors),
    ]
  );
}

export async function listRetentionScores(
  client: DbClient,
  operatingCompanyId: string,
  tier?: RetentionTier
) {
  const values: unknown[] = [operatingCompanyId];
  let sql = `
    SELECT DISTINCT ON (driver_uuid)
      driver_uuid::text, retention_risk_score::float8, retention_tier,
      contributing_factors, computed_at::text
    FROM drivers.retention_scores
    WHERE operating_company_id = $1::uuid
  `;
  if (tier) {
    values.push(tier);
    sql += ` AND retention_tier = $${values.length}`;
  }
  sql += ` ORDER BY driver_uuid, computed_at DESC`;
  const res = await client.query(sql, values);
  return res.rows;
}
