export const INSURANCE_COVERAGE_TYPES = [
  "auto_liability",
  "physical_damage",
  "cargo",
  "general_liability",
  "workers_comp",
  "trailer_interchange",
  "bobtail",
  "non_trucking_liability",
  "umbrella",
  "excess_liability",
  "occupational_accident",
  "garage_keepers",
  "reefer_breakdown",
  "pollution",
  "cyber_liability",
] as const;

export const INSURANCE_POLICY_STATUSES = ["active", "expired", "cancelled", "pending"] as const;

export type InsuranceCoverageType = (typeof INSURANCE_COVERAGE_TYPES)[number];
export type InsurancePolicyStatus = (typeof INSURANCE_POLICY_STATUSES)[number];
