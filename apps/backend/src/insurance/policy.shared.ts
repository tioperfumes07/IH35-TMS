export const INSURANCE_COVERAGE_TYPES = [
  "auto_liability",
  "physical_damage",
  "cargo",
  "general_liability",
  "workers_comp",
] as const;

export const INSURANCE_POLICY_STATUSES = ["active", "expired", "cancelled", "pending"] as const;

export type InsuranceCoverageType = (typeof INSURANCE_COVERAGE_TYPES)[number];
export type InsurancePolicyStatus = (typeof INSURANCE_POLICY_STATUSES)[number];
