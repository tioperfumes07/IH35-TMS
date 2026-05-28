export const BLOCKING_DRUG_TEST_RESULTS = ["positive", "refusal", "adulterated", "substituted"] as const;

export type BlockingDrugTestResult = (typeof BLOCKING_DRUG_TEST_RESULTS)[number];

export function isBlockingDrugTestResult(result: string): result is BlockingDrugTestResult {
  return (BLOCKING_DRUG_TEST_RESULTS as readonly string[]).includes(String(result ?? "").toLowerCase());
}
