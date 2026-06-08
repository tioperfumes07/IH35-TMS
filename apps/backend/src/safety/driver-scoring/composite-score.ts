export const MIN_MILES_TO_SCORE = 500;

export const COMPOSITE_WEIGHTS = {
  brake: 0.3,
  accel: 0.25,
  speeding: 0.25,
  lane: 0.2,
} as const;

export type CompositeScoreInput = {
  harsh_brake_per_100mi: number;
  hard_accel_per_100mi: number;
  speeding_pct: number;
  lane_departure_per_100mi: number;
  miles_driven: number;
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function subScoreBrake(rate: number): number {
  return clampScore(100 - rate * 12);
}

function subScoreAccel(rate: number): number {
  return clampScore(100 - rate * 12);
}

function subScoreSpeeding(pct: number): number {
  return clampScore(100 - pct * 2.5);
}

function subScoreLane(rate: number): number {
  return clampScore(100 - rate * 15);
}

export function computeCompositeScore(input: CompositeScoreInput): number | null {
  if (input.miles_driven < MIN_MILES_TO_SCORE) return null;

  const brake = subScoreBrake(input.harsh_brake_per_100mi);
  const accel = subScoreAccel(input.hard_accel_per_100mi);
  const speeding = subScoreSpeeding(input.speeding_pct);
  const lane = subScoreLane(input.lane_departure_per_100mi);

  const composite =
    brake * COMPOSITE_WEIGHTS.brake +
    accel * COMPOSITE_WEIGHTS.accel +
    speeding * COMPOSITE_WEIGHTS.speeding +
    lane * COMPOSITE_WEIGHTS.lane;

  return Number(composite.toFixed(2));
}

export function buildCompositeInput(counts: {
  harsh_brake_count: number;
  hard_accel_count: number;
  speeding_seconds: number;
  lane_departure_count: number;
  miles_driven: number;
  driving_seconds?: number;
}): CompositeScoreInput {
  const miles = Math.max(counts.miles_driven, 0);
  const per100 = miles > 0 ? (value: number) => (value / miles) * 100 : () => 0;
  const drivingSeconds = counts.driving_seconds ?? Math.max(miles * 60, 1);
  const speedingPct = drivingSeconds > 0 ? (counts.speeding_seconds / drivingSeconds) * 100 : 0;

  return {
    harsh_brake_per_100mi: per100(counts.harsh_brake_count),
    hard_accel_per_100mi: per100(counts.hard_accel_count),
    lane_departure_per_100mi: per100(counts.lane_departure_count),
    speeding_pct: speedingPct,
    miles_driven: miles,
  };
}
