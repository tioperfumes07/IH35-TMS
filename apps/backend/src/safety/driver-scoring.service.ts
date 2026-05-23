type CountsBySeverity = {
  minor: number;
  major: number;
  critical: number;
};

export function computeDriverScoreFromCounts(input: { counts: CountsBySeverity; periodMiles: number | null }) {
  const penalties = input.counts.critical * 10 + input.counts.major * 5 + input.counts.minor * 1;
  const score = Math.max(0, 100 - penalties);
  const periodMiles = input.periodMiles ?? 0;
  const scorePer1kMiles = periodMiles > 0 ? Number(((score / periodMiles) * 1000).toFixed(2)) : null;
  return {
    score,
    period_miles: periodMiles,
    score_per_1k_miles: scorePer1kMiles,
  };
}
