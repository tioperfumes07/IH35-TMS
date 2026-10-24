/** LEAD 443.243 — Fuel Assignment Question API (popup + Fuel questions list). */
import { apiRequest } from "./client";

export type FuelCandidateLoad = {
  load_id: string | null;
  load_number: string | null;
  settlement_ref: string | null;
  pickup: string | null;
  delivery: string | null;
  route: string | null;
};

export type FuelCandidateTruck = {
  unit_id: string;
  unit_number: string;
  distance_m: number | null;
  minutes_off: number | null;
  distance_mi: number | null;
  samsara_driver: string | null;
  odometer: number | null;
  /** 443.296 — present when the engine sends them. Absent fields render as an em dash. */
  at_station?: string | null;
  odometer_at_fill?: number | null;
  /** 443.258-A: null when the truck had no load at the pump moment (never omitted by the API). */
  load: FuelCandidateLoad | null;
};

export type FuelAssignmentQuestion = {
  id: string;
  operating_company_id: string;
  fuel_transaction_id: string;
  status: "open" | "answered" | "cancelled";
  fill_moment_at: string | null;
  fill_moment_ct: string | null;
  station: string | null;
  gallons: string | null;
  amount_cents: string | null;
  card_unit_id: string | null;
  card_unit_number: string | null;
  card_driver_id: string | null;
  card_driver_name: string | null;
  evidence: {
    candidates: FuelCandidateTruck[];
    truck_resolution: string;
    load_resolution: string;
    moment_source: string | null;
  };
  proposed_unit_id: string | null;
  proposed_unit_number: string | null;
  proposed_load_id: string | null;
  proposed_load_number: string | null;
  proposed_settlement_ref: string | null;
  proposed_why: string | null;
  answer_kind: "confirm_proposed" | "pick_other" | "keep_card_truck" | null;
  answered_unit_id: string | null;
  answered_load_id: string | null;
  answer_reason: string | null;
  answered_by_user_id: string | null;
  answered_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AnswerKind = "confirm_proposed" | "pick_other" | "keep_card_truck";

function q(companyId: string) {
  return `operating_company_id=${encodeURIComponent(companyId)}`;
}

export function listFuelAssignmentQuestions(
  companyId: string,
  opts: {
    status?: "open" | "answered" | "cancelled" | "all";
    loadId?: string;
    unitId?: string;
    fuelId?: string;
    limit?: number;
    offset?: number;
  } = {}
) {
  const params = new URLSearchParams();
  params.set("operating_company_id", companyId);
  if (opts.status) params.set("status", opts.status);
  if (opts.loadId) params.set("load_id", opts.loadId);
  if (opts.unitId) params.set("unit_id", opts.unitId);
  if (opts.fuelId) params.set("fuel_id", opts.fuelId);
  if (opts.limit != null) params.set("limit", String(opts.limit));
  if (opts.offset != null) params.set("offset", String(opts.offset));
  return apiRequest<{ rows: FuelAssignmentQuestion[]; total: number }>(
    `/api/v1/fuel/assignment-questions?${params.toString()}`
  );
}

export function countOpenFuelAssignmentQuestions(companyId: string) {
  return apiRequest<{ count: number }>(`/api/v1/fuel/assignment-questions/open-count?${q(companyId)}`);
}

export function getFuelAssignmentQuestion(companyId: string, id: string) {
  return apiRequest<{ question: FuelAssignmentQuestion }>(
    `/api/v1/fuel/assignment-questions/${encodeURIComponent(id)}?${q(companyId)}`
  );
}

export function evaluateFuelAssignment(
  companyId: string,
  fuelTransactionId: string,
  applyIfCertain = true
) {
  return apiRequest<{
    certain: boolean;
    question: FuelAssignmentQuestion | null;
    resolution?: unknown;
    outcome?: string;
    error?: string;
  }>("/api/v1/fuel/assignment-questions/evaluate", {
    method: "POST",
    body: {
      operating_company_id: companyId,
      fuel_transaction_id: fuelTransactionId,
      apply_if_certain: applyIfCertain,
    },
  });
}

export function answerFuelAssignmentQuestion(
  companyId: string,
  questionId: string,
  input: {
    kind: AnswerKind;
    unit_id?: string | null;
    load_id?: string | null;
    reason?: string | null;
  }
) {
  return apiRequest<{ question: FuelAssignmentQuestion; outcome: string }>(
    `/api/v1/fuel/assignment-questions/${encodeURIComponent(questionId)}/answer`,
    {
      method: "POST",
      body: {
        operating_company_id: companyId,
        kind: input.kind,
        unit_id: input.unit_id ?? null,
        load_id: input.load_id ?? null,
        reason: input.reason ?? null,
      },
    }
  );
}

/** After create/import: evaluate; return the open question when not certain. */
export async function evaluateFuelAssignmentOrNull(
  companyId: string,
  fuelTransactionId: string
): Promise<FuelAssignmentQuestion | null> {
  try {
    const res = await evaluateFuelAssignment(companyId, fuelTransactionId, true);
    if (res.certain || !res.question) return null;
    return res.question;
  } catch {
    return null;
  }
}

/** First open question (optional load filter) — used when create paths do not return a fuel id. */
export async function firstOpenFuelAssignmentQuestion(
  companyId: string,
  opts?: { loadId?: string }
): Promise<FuelAssignmentQuestion | null> {
  try {
    const listed = await listFuelAssignmentQuestions(companyId, {
      status: "open",
      loadId: opts?.loadId,
      limit: 1,
    });
    return listed.rows[0] ?? null;
  } catch {
    return null;
  }
}

/** Evaluate each new fuel tx; return the first open question (or any open company question). */
export async function evaluateFuelAssignmentsFirstQuestion(
  companyId: string,
  fuelTransactionIds: string[]
): Promise<FuelAssignmentQuestion | null> {
  for (const id of fuelTransactionIds) {
    if (!id) continue;
    const q = await evaluateFuelAssignmentOrNull(companyId, id);
    if (q) return q;
  }
  return firstOpenFuelAssignmentQuestion(companyId);
}
