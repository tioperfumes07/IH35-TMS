export type ScenarioStage = "spec" | "built" | "merged" | "proof" | "passed" | "complete";
export type ScenarioState = "go" | "fix" | "done";
export type EntityScope = "ALL" | "TRANSP" | "USMCA" | "TRK";

export type ScenarioTrackerItem = {
  key: string;
  title: string;
  lane: "screens" | "money" | "ops" | "risk" | string;
  stage: ScenarioStage | number;
  state: ScenarioState;
  evidence?: string;
  doing?: string;
  je?: string;
  je_contract?: {
    source_type?: string | null;
    lines: Array<{ side: "DR" | "CR"; account_role: string; account_code_any_of?: string[] }>;
    must_balance: true;
  } | null;
  spec_ref?: string;
  trigger?: string;
  links?: string;
  blocked?: string;
  /** Canonical in-app surface that performs this hop (V3 wiring — click the title). */
  href?: string;
};

export type ScenarioTrackerResponse = {
  generated_at_utc: string;
  generated_at_ct: string;
  tz_label?: string;
  max_age_seconds: number;
  entity_scope: EntityScope | string;
  hops: ScenarioTrackerItem[];
  scenarios: ScenarioTrackerItem[];
  source_health: Array<{ source: string; ok: boolean; probed_at_ct?: string }>;
};

export const STAGE_LABELS: ScenarioStage[] = ["spec", "built", "merged", "proof", "passed", "complete"];
export const STAGE_DISPLAY = ["Spec", "Built", "Merged", "Proof", "Passed", "Complete"] as const;

export function stageIndex(stage: ScenarioStage | number | undefined): number {
  if (typeof stage === "number" && Number.isFinite(stage)) {
    return Math.max(0, Math.min(5, Math.floor(stage)));
  }
  const i = STAGE_LABELS.indexOf(String(stage || "spec").toLowerCase() as ScenarioStage);
  return i >= 0 ? i : 0;
}
