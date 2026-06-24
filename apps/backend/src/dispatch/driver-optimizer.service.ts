import { withCurrentUser } from "../auth/db.js";

/** Default multi-factor weights (B21-D8). */
export const DEFAULT_OPTIMIZER_WEIGHTS = {
  hos: 0.35,
  proximity: 0.25,
  eligibility: 0.25,
  performance: 0.15,
} as const;

export type OptimizerScoreBreakdown = {
  hos_score: number;
  proximity_score: number;
  eligibility_score: number;
  performance_score: number;
  deadhead_penalty: number;
};

export type OptimalDriverRow = {
  driver_id: string;
  display_name: string;
  display_id: string | null;
  rank: number;
  total_score: number;
  breakdown: OptimizerScoreBreakdown;
  hos_safe: boolean;
  distance_to_pickup_miles: number;
  eligible: boolean;
  ineligible_reason: string | null;
};

export type LoadOptimizerContext = {
  pickup_city: string;
  pickup_state: string;
  hazmat: boolean;
  trailer_type: string | null;
  required_endorsements: string[];
};

type DriverCandidate = {
  id: string;
  first_name: string;
  last_name: string;
  display_id: string | null;
  is_in_violation: boolean;
  minutes_until_violation: number;
  endorsement_h: boolean;
  endorsement_n: boolean;
  endorsement_t: boolean;
  endorsement_x: boolean;
  recent_on_time_pct: number;
  completed_loads_30d: number;
  distance_to_pickup_miles: number;
};

export function computeHosScore(candidate: Pick<DriverCandidate, "is_in_violation" | "minutes_until_violation">): number {
  if (candidate.is_in_violation) return 0;
  const hours = Math.min(11, Math.max(0, candidate.minutes_until_violation / 60));
  return Math.round((hours / 11) * 100);
}

export function computeProximityScore(distanceMiles: number): number {
  const clamped = Math.max(0, Math.min(500, distanceMiles));
  return Math.round((1 - clamped / 500) * 100);
}

export function computeEligibilityScore(
  candidate: Pick<DriverCandidate, "endorsement_h" | "endorsement_n" | "endorsement_t" | "endorsement_x">,
  ctx: Pick<LoadOptimizerContext, "hazmat" | "required_endorsements">
): { score: number; eligible: boolean; reason: string | null } {
  const required = new Set(ctx.required_endorsements.map((e) => e.toUpperCase()));
  if (ctx.hazmat) required.add("H");
  const flags: Record<string, boolean> = {
    H: candidate.endorsement_h,
    N: candidate.endorsement_n,
    T: candidate.endorsement_t,
    X: candidate.endorsement_x,
  };
  const missing = [...required].filter((code) => !flags[code]);
  if (missing.length) {
    return { score: 0, eligible: false, reason: `Missing endorsement(s): ${missing.join(", ")}` };
  }
  const matched = [...required].filter((code) => flags[code]).length;
  const denom = Math.max(1, required.size);
  return { score: Math.round((matched / denom) * 100), eligible: true, reason: null };
}

export function computePerformanceScore(candidate: Pick<DriverCandidate, "recent_on_time_pct" | "completed_loads_30d">): number {
  const onTime = Math.max(0, Math.min(100, candidate.recent_on_time_pct));
  const volumeBoost = Math.min(20, candidate.completed_loads_30d * 2);
  return Math.round(Math.min(100, onTime * 0.8 + volumeBoost));
}

export function computeDeadheadPenalty(distanceMiles: number, ctxMilesDeadhead?: number | null): number {
  const deadhead = ctxMilesDeadhead ?? distanceMiles;
  return Math.round(Math.min(40, Math.max(0, deadhead / 10)));
}

export function scoreDriverCandidate(
  candidate: DriverCandidate,
  ctx: LoadOptimizerContext,
  weights = DEFAULT_OPTIMIZER_WEIGHTS,
  ctxMilesDeadhead?: number | null
): OptimalDriverRow {
  const hos_score = computeHosScore(candidate);
  const proximity_score = computeProximityScore(candidate.distance_to_pickup_miles);
  const eligibility = computeEligibilityScore(candidate, ctx);
  const performance_score = computePerformanceScore(candidate);
  const deadhead_penalty = computeDeadheadPenalty(candidate.distance_to_pickup_miles, ctxMilesDeadhead);

  const weighted =
    hos_score * weights.hos +
    proximity_score * weights.proximity +
    eligibility.score * weights.eligibility +
    performance_score * weights.performance;

  const total_score = Math.round(Math.max(0, weighted - deadhead_penalty * 0.1));

  const estimatedDriveHours = Math.min(11, Math.max(0.5, candidate.distance_to_pickup_miles / 50));
  const hoursRemainingToday = candidate.is_in_violation
    ? 0
    : Math.min(11, Math.max(0, candidate.minutes_until_violation / 60));
  const hos_safe = !candidate.is_in_violation && hoursRemainingToday >= estimatedDriveHours;

  return {
    driver_id: candidate.id,
    display_name: `${candidate.first_name} ${candidate.last_name}`.trim(),
    display_id: candidate.display_id,
    rank: 0,
    total_score,
    breakdown: {
      hos_score,
      proximity_score,
      eligibility_score: eligibility.score,
      performance_score,
      deadhead_penalty,
    },
    hos_safe,
    distance_to_pickup_miles: candidate.distance_to_pickup_miles,
    eligible: eligibility.eligible,
    ineligible_reason: eligibility.reason,
  };
}

export function rankOptimalDrivers(rows: OptimalDriverRow[], limit = 10): OptimalDriverRow[] {
  const sorted = [...rows].sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    if (a.total_score !== b.total_score) return b.total_score - a.total_score;
    return a.distance_to_pickup_miles - b.distance_to_pickup_miles;
  });
  return sorted.slice(0, limit).map((row, idx) => ({ ...row, rank: idx + 1 }));
}

function endorsementsForTrailer(trailerType: string | null): string[] {
  const t = (trailerType ?? "").toLowerCase();
  if (t.includes("tank") || t.includes("hazmat")) return ["H", "N"];
  if (t.includes("double") || t.includes("triple")) return ["T"];
  return [];
}

function pseudoDistanceMiles(seed: string, pickupCity: string, index: number): number {
  let hash = index * 17;
  for (let i = 0; i < seed.length; i += 1) hash = (hash + seed.charCodeAt(i) * (i + 3)) % 97;
  return pickupCity ? 12 + (hash % 37) : 50 + index;
}

export type OptimalDriversQuery = {
  operating_company_id: string;
  load_id: string;
  for_pickup_at?: string;
  /** Book-load preview seam when load row does not exist yet. */
  preview_pickup_city?: string;
  preview_pickup_state?: string;
  preview_hazmat?: boolean;
  preview_trailer_type?: string;
};

export async function listOptimalDriversForLoad(userId: string, query: OptimalDriversQuery) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${query.operating_company_id}'`);

    const loadRes = await client.query(
      `
        SELECT
          l.id,
          -- FIX-7 (optimal-drivers 500, twin of #1444/#1448): mdata.loads has NO hazmat column (42703 x8 live);
          -- book-load persists hazmat into the quicksave_pending_fields jsonb, so read it from there.
          COALESCE((l.quicksave_pending_fields->>'hazmat')::boolean, false) AS hazmat,
          -- trailer_type exists on prod but NOT in a from-migrations build (prod<->migration drift). Per GUARD,
          -- do not reference it directly in this from-migrations-critical query until the drift migration lands.
          -- The booking-preview path still supplies the trailer type via the preview_trailer_type query param;
          -- the saved-load path degrades to NULL (no trailer-endorsement filter) until the drift migration.
          NULL::text AS trailer_type,
          COALESCE(sp.city, '') AS pickup_city,
          COALESCE(sp.state, '') AS pickup_state,
          l.miles_deadhead
        FROM mdata.loads l
        LEFT JOIN LATERAL (
          SELECT city, state FROM mdata.load_stops s
          WHERE s.load_id = l.id AND s.stop_type = 'pickup'::mdata.stop_type_enum
          ORDER BY s.sequence_number ASC
          LIMIT 1
        ) sp ON true
        WHERE l.id = $1 AND l.operating_company_id = $2 AND l.soft_deleted_at IS NULL
      `,
      [query.load_id, query.operating_company_id]
    );

    let ctx: LoadOptimizerContext;
    let milesDeadhead: number | null = null;

    if (loadRes.rows[0]) {
      const row = loadRes.rows[0] as {
        hazmat: boolean;
        trailer_type: string | null;
        pickup_city: string;
        pickup_state: string;
        miles_deadhead: number | null;
      };
      ctx = {
        pickup_city: row.pickup_city,
        pickup_state: row.pickup_state,
        hazmat: row.hazmat,
        trailer_type: row.trailer_type,
        required_endorsements: endorsementsForTrailer(row.trailer_type),
      };
      milesDeadhead = row.miles_deadhead;
    } else if (query.preview_pickup_city != null) {
      ctx = {
        pickup_city: query.preview_pickup_city,
        pickup_state: query.preview_pickup_state ?? "",
        hazmat: Boolean(query.preview_hazmat),
        trailer_type: query.preview_trailer_type ?? null,
        required_endorsements: endorsementsForTrailer(query.preview_trailer_type ?? null),
      };
    } else {
      throw new Error("E_LOAD_NOT_FOUND");
    }

    const driversRes = await client.query(
      `
        SELECT
          d.id,
          d.first_name,
          d.last_name,
          d.id::text AS display_id,
          COALESCE(h.is_in_violation, false) AS is_in_violation,
          COALESCE(h.minutes_until_violation, 9999)::double precision AS minutes_until_violation,
          COALESCE(d.endorsement_h, false) AS endorsement_h,
          COALESCE(d.endorsement_n, false) AS endorsement_n,
          COALESCE(d.endorsement_t, false) AS endorsement_t,
          COALESCE(d.endorsement_x, false) AS endorsement_x,
          COALESCE(perf.on_time_pct, 75)::double precision AS recent_on_time_pct,
          COALESCE(perf.completed_loads_30d, 0)::int AS completed_loads_30d
        FROM mdata.drivers d
        LEFT JOIN views.drivers_with_hos_status h ON h.id = d.id
        LEFT JOIN LATERAL (
          SELECT
            CASE WHEN COUNT(*) = 0 THEN 75
                 ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE l.status IN ('completed_docs_received', 'delivered_pending_docs')) / COUNT(*))::double precision
            END AS on_time_pct,
            COUNT(*) FILTER (WHERE l.created_at >= now() - interval '30 days')::int AS completed_loads_30d
          FROM mdata.loads l
          WHERE l.assigned_primary_driver_id = d.id
            AND l.operating_company_id = $1
            AND l.soft_deleted_at IS NULL
        ) perf ON true
        WHERE d.operating_company_id = $1
          AND d.status = 'Active'::mdata.driver_status
          AND d.deactivated_at IS NULL
        ORDER BY d.last_name ASC, d.first_name ASC
        LIMIT 200
      `,
      [query.operating_company_id]
    );

    const rows = driversRes.rows as DriverCandidate[];
    const scored = rows.map((r, idx) =>
      scoreDriverCandidate(
        {
          ...r,
          distance_to_pickup_miles: pseudoDistanceMiles(r.id, ctx.pickup_city, idx),
        },
        ctx,
        DEFAULT_OPTIMIZER_WEIGHTS,
        milesDeadhead
      )
    );

    const drivers = rankOptimalDrivers(scored, 10);
    return {
      drivers,
      weights: DEFAULT_OPTIMIZER_WEIGHTS,
      load_context: {
        pickup_city: ctx.pickup_city,
        pickup_state: ctx.pickup_state,
        hazmat: ctx.hazmat,
        trailer_type: ctx.trailer_type,
      },
    };
  });
}
