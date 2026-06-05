export const CSA_BASIC_CATEGORIES = [
  "unsafe_driving",
  "hos_compliance",
  "driver_fitness",
  "controlled_substances_alcohol",
  "vehicle_maintenance",
  "hazmat_compliance",
  "crash_indicator",
] as const;

export type CsaBasicCategory = (typeof CSA_BASIC_CATEGORIES)[number];
export type CsaAlertStatus = "yes" | "no" | "inconclusive";

export type CsaSnapshotRow = {
  basic_category: CsaBasicCategory;
  snapshot_date: string;
  score: number | null;
  pct_percentile: number | null;
  threshold: number;
  alert_status: CsaAlertStatus;
  pulled_at: string;
};

export type CsaProjection = {
  basic_category: CsaBasicCategory;
  latest_score: number | null;
  latest_percentile: number | null;
  threshold: number;
  latest_alert_status: CsaAlertStatus;
  projected_score_30d: number | null;
  slope_per_day: number;
  trending_toward_alert: boolean;
  risk_band: "ok" | "watch" | "alert" | "unknown";
  suggested_action_type: string;
  suggested_action_title: string;
  suggested_action_description: string;
};

export type CsaMitigationActionRow = {
  id: string;
  basic_category: CsaBasicCategory;
  action_type: string;
  title: string;
  description: string | null;
  owner_user_id: string | null;
  due_date: string;
  status: string;
  priority: number | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RankedMitigationAction = CsaMitigationActionRow & {
  urgency_score: number;
  category_risk_band: "ok" | "watch" | "alert" | "unknown";
  category_latest_score: number | null;
  category_threshold: number | null;
  days_until_due: number;
};

export const CSA_THRESHOLDS: Record<CsaBasicCategory, number> = {
  unsafe_driving: 65,
  hos_compliance: 65,
  driver_fitness: 80,
  controlled_substances_alcohol: 80,
  vehicle_maintenance: 80,
  hazmat_compliance: 80,
  crash_indicator: 65,
};

export const CSA_LABELS: Record<CsaBasicCategory, string> = {
  unsafe_driving: "Unsafe Driving",
  hos_compliance: "HOS Compliance",
  driver_fitness: "Driver Fitness",
  controlled_substances_alcohol: "Controlled Substances / Alcohol",
  vehicle_maintenance: "Vehicle Maintenance",
  hazmat_compliance: "HazMat Compliance",
  crash_indicator: "Crash Indicator",
};

type Suggestion = {
  action_type: string;
  title: string;
  description: string;
};

const SUGGESTIONS: Record<CsaBasicCategory, Suggestion> = {
  unsafe_driving: {
    action_type: "coaching_campaign",
    title: "Run unsafe-driving coaching campaign",
    description: "Review speeding/following-distance events from the last 30 days and assign targeted coaching for repeat drivers.",
  },
  hos_compliance: {
    action_type: "elog_audit",
    title: "Audit HOS e-log compliance",
    description: "Audit ELD logs for the last 30 days, prioritize recurring violations, and issue corrective coaching plans.",
  },
  driver_fitness: {
    action_type: "dq_file_audit",
    title: "Audit driver qualification files",
    description: "Review medical cards, licenses, and endorsements for active drivers; clear all missing/expired items.",
  },
  controlled_substances_alcohol: {
    action_type: "drug_program_audit",
    title: "Audit drug and alcohol program execution",
    description: "Validate random pool selections, test completion SLAs, and supervisor reasonable-suspicion training coverage.",
  },
  vehicle_maintenance: {
    action_type: "inspection_blitz",
    title: "Launch maintenance inspection blitz",
    description: "Run a focused PM/defect closeout cycle for high-mileage units and verify DVIR defects are closed with evidence.",
  },
  hazmat_compliance: {
    action_type: "hazmat_file_review",
    title: "Review HazMat credential readiness",
    description: "Validate HazMat endorsements, training renewals, and placard/document compliance for active hazmat loads.",
  },
  crash_indicator: {
    action_type: "incident_prevention",
    title: "Execute crash-indicator prevention plan",
    description: "Review preventable incidents, retrain high-risk drivers, and enforce route-level risk mitigation controls.",
  },
};

function toEpochDay(value: string): number {
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) return 0;
  return Math.floor(millis / 86_400_000);
}

function computeSlopePerDay(history: ReadonlyArray<{ x: number; y: number }>): number {
  if (history.length < 2) return 0;
  const n = history.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  for (const point of history) {
    sumX += point.x;
    sumY += point.y;
    sumXY += point.x * point.y;
    sumX2 += point.x * point.x;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

function projectScore(latestScore: number, slopePerDay: number, horizonDays = 30): number {
  return latestScore + slopePerDay * horizonDays;
}

function normalizeRiskBand(
  latestScore: number | null,
  threshold: number,
  projectedScore30d: number | null,
  latestAlertStatus: CsaAlertStatus
): "ok" | "watch" | "alert" | "unknown" {
  if (latestScore == null) return "unknown";
  if (latestAlertStatus === "yes" || latestScore >= threshold) return "alert";
  if (projectedScore30d != null && projectedScore30d >= threshold * 0.9) return "watch";
  return "ok";
}

function daysUntil(dateText: string): number {
  const due = toEpochDay(dateText);
  const now = Math.floor(Date.now() / 86_400_000);
  return due - now;
}

export function getMitigationSuggestion(basicCategory: CsaBasicCategory): Suggestion {
  return SUGGESTIONS[basicCategory];
}

export function projectBasicTrend(
  rows: ReadonlyArray<CsaSnapshotRow>,
  basicCategory: CsaBasicCategory
): CsaProjection {
  const threshold = CSA_THRESHOLDS[basicCategory];
  const sorted = [...rows].sort((a, b) => Date.parse(a.snapshot_date) - Date.parse(b.snapshot_date));
  const latest = sorted[sorted.length - 1] ?? null;
  const usable = sorted
    .filter((row) => row.score != null)
    .slice(-6)
    .map((row) => ({ x: toEpochDay(row.snapshot_date), y: Number(row.score) }));

  const slopePerDay = computeSlopePerDay(usable);
  const latestScore = latest?.score != null ? Number(latest.score) : null;
  const projectedScore30d =
    latestScore == null ? null : Number(projectScore(latestScore, slopePerDay, 30).toFixed(2));
  const latestPercentile = latest?.pct_percentile != null ? Number(latest.pct_percentile) : null;
  const latestAlertStatus: CsaAlertStatus = latest?.alert_status ?? "inconclusive";
  const trendingTowardAlert =
    latestScore != null &&
    latestScore < threshold &&
    projectedScore30d != null &&
    projectedScore30d >= threshold * 0.9;

  const suggestion = getMitigationSuggestion(basicCategory);
  return {
    basic_category: basicCategory,
    latest_score: latestScore,
    latest_percentile: latestPercentile,
    threshold,
    latest_alert_status: latestAlertStatus,
    projected_score_30d: projectedScore30d,
    slope_per_day: Number(slopePerDay.toFixed(4)),
    trending_toward_alert: trendingTowardAlert,
    risk_band: normalizeRiskBand(latestScore, threshold, projectedScore30d, latestAlertStatus),
    suggested_action_type: suggestion.action_type,
    suggested_action_title: suggestion.title,
    suggested_action_description: suggestion.description,
  };
}

export function buildProjectionSet(rows: ReadonlyArray<CsaSnapshotRow>): CsaProjection[] {
  const grouped = new Map<CsaBasicCategory, CsaSnapshotRow[]>();
  for (const row of rows) {
    const list = grouped.get(row.basic_category) ?? [];
    list.push(row);
    grouped.set(row.basic_category, list);
  }
  return CSA_BASIC_CATEGORIES.map((category) => projectBasicTrend(grouped.get(category) ?? [], category));
}

export function rankMitigationQueue(
  actions: ReadonlyArray<CsaMitigationActionRow>,
  projections: ReadonlyArray<CsaProjection>
): RankedMitigationAction[] {
  const byCategory = new Map<CsaBasicCategory, CsaProjection>();
  for (const projection of projections) {
    byCategory.set(projection.basic_category, projection);
  }
  const withScores = actions.map((action) => {
    const projection = byCategory.get(action.basic_category);
    const days = daysUntil(action.due_date);
    const dueUrgency = days < 0 ? 60 + Math.min(Math.abs(days), 30) : Math.max(0, 30 - days);
    const riskUrgency =
      projection?.risk_band === "alert"
        ? 40
        : projection?.risk_band === "watch"
          ? 24
          : projection?.risk_band === "ok"
            ? 8
            : 4;
    const priorityUrgency = Math.max(0, Number(action.priority ?? 0)) * 3;
    const urgency = dueUrgency + riskUrgency + priorityUrgency;
    return {
      ...action,
      urgency_score: urgency,
      category_risk_band: projection?.risk_band ?? "unknown",
      category_latest_score: projection?.latest_score ?? null,
      category_threshold: projection?.threshold ?? null,
      days_until_due: days,
    };
  });
  withScores.sort((a, b) => {
    if (b.urgency_score !== a.urgency_score) return b.urgency_score - a.urgency_score;
    return Date.parse(a.due_date) - Date.parse(b.due_date);
  });
  return withScores;
}
