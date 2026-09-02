/** MILES-INVERT-01 — detect catalog column inversion (short > practical). */
export function isMilesColumnInverted(practical: number, shortest: number): boolean {
  return practical > 0 && shortest > 0 && shortest > practical;
}

const REVERSE_LANE_SHORT_DIFF_REASON = "reverse_lane_short_differs_over_100mi";
const SHORT_EXCEEDS_PRACTICAL_REASON = "short_exceeds_practical";

/** Reverse A↔B short miles differ by more than 100mi (catalog trigger reason). */
export function isReverseLaneShortDiffUntrustworthy(reason: string | null | undefined): boolean {
  return Boolean(reason?.includes(REVERSE_LANE_SHORT_DIFF_REASON));
}

export function milesUntrustworthyFlags(params: {
  practical: number;
  shortest: number;
  shortMilesUntrustworthy?: boolean;
  shortMilesUntrustworthyReason?: string | null;
}): { columnInverted: boolean; reverseLaneShortDiff: boolean; any: boolean } {
  const columnInverted =
    isMilesColumnInverted(params.practical, params.shortest) ||
    Boolean(params.shortMilesUntrustworthyReason?.includes(SHORT_EXCEEDS_PRACTICAL_REASON));
  const reverseLaneShortDiff = isReverseLaneShortDiffUntrustworthy(params.shortMilesUntrustworthyReason);
  const any = columnInverted || reverseLaneShortDiff || Boolean(params.shortMilesUntrustworthy);
  return { columnInverted, reverseLaneShortDiff, any };
}
