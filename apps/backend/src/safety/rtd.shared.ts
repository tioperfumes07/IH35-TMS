export const RTD_STAGES = [
  "removed",
  "sap_evaluation",
  "education_treatment",
  "rtd_test_scheduled",
  "rtd_test_negative",
  "follow_up_testing",
  "complete",
] as const;

export type RtdStage = (typeof RTD_STAGES)[number];

export function isRtdStage(value: string): value is RtdStage {
  return (RTD_STAGES as readonly string[]).includes(value);
}

export function nextRtdStage(stage: RtdStage): RtdStage | null {
  const idx = RTD_STAGES.indexOf(stage);
  if (idx < 0 || idx >= RTD_STAGES.length - 1) return null;
  return RTD_STAGES[idx + 1] ?? null;
}

export function isLegalRtdAdvance(fromStage: RtdStage, toStage: RtdStage): boolean {
  return nextRtdStage(fromStage) === toStage;
}

export function isDispatchBlockedByRtd(stage: RtdStage, clearinghouseUpdated: boolean): boolean {
  if (stage !== "complete") return true;
  return !clearinghouseUpdated;
}

export function canCloseRtdCase(stage: RtdStage, clearinghouseUpdated: boolean): boolean {
  return stage === "complete" && clearinghouseUpdated;
}

export function requiresNegativeRtdTest(stage: RtdStage): boolean {
  return stage === "rtd_test_negative";
}
