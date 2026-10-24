/**
 * 443.288-C — Expense load confirmations queue API (ruling contract).
 * Routes land with CC-2's 443.288-B. Until then every call fails closed (404 ≠ empty/confirmed).
 */
import { ApiError, apiRequest } from "./client";

function withCompany(path: string, companyId: string): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}operating_company_id=${encodeURIComponent(companyId)}`;
}

export type ExpenseLoadConfirmationStatus = "proposed" | "confirmed";

export type ExpenseLoadProposalEvidence = {
  truck_at_pump?: boolean | null;
  gps_distance_miles?: number | null;
  minutes_off?: number | null;
  load_running?: boolean | null;
  load_next?: boolean | null;
  summary?: string | null;
};

export type ExpenseLoadConfirmationRow = {
  id: string;
  expense_number: string | null;
  transaction_date: string;
  amount_cents: number | string;
  load_confirmation: ExpenseLoadConfirmationStatus;
  load_id: string | null;
  load_number: string | null;
  driver_id: string | null;
  driver_name: string | null;
  unit_id: string | null;
  unit_number: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
  settlement_id: string | null;
  settlement_number: string | null;
  proposal_evidence: ExpenseLoadProposalEvidence | null;
  confirmed_by_user_id?: string | null;
  confirmed_at?: string | null;
};

export type ListExpenseLoadConfirmationsParams = {
  status?: ExpenseLoadConfirmationStatus | "all";
  driver_id?: string;
  unit_id?: string;
  load_id?: string;
  vendor_uuid?: string;
  settlement_id?: string;
  limit?: number;
  offset?: number;
};

/** Thrown when 443.288-B confirm routes are not on the deployed API yet. */
export class ExpenseLoadConfirmEngineUnavailableError extends Error {
  readonly code = "EXPENSE_LOAD_CONFIRM_ENGINE_UNAVAILABLE" as const;
  constructor(message = "Expense load confirm engine is not deployed yet (443.288-B).") {
    super(message);
    this.name = "ExpenseLoadConfirmEngineUnavailableError";
  }
}

function rethrowEngineGap(err: unknown): never {
  if (err instanceof ApiError && (err.status === 404 || err.status === 501)) {
    throw new ExpenseLoadConfirmEngineUnavailableError();
  }
  throw err;
}

export async function listExpenseLoadConfirmations(
  operatingCompanyId: string,
  params: ListExpenseLoadConfirmationsParams = {},
): Promise<{ rows: ExpenseLoadConfirmationRow[] }> {
  const query = new URLSearchParams();
  if (params.status && params.status !== "all") query.set("status", params.status);
  if (params.driver_id) query.set("driver_id", params.driver_id);
  if (params.unit_id) query.set("unit_id", params.unit_id);
  if (params.load_id) query.set("load_id", params.load_id);
  if (params.vendor_uuid) query.set("vendor_uuid", params.vendor_uuid);
  if (params.settlement_id) query.set("settlement_id", params.settlement_id);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  const qs = query.toString();
  const path = `/api/v1/expenses/load-confirmations${qs ? `?${qs}` : ""}`;
  try {
    return await apiRequest<{ rows: ExpenseLoadConfirmationRow[] }>(withCompany(path, operatingCompanyId));
  } catch (err) {
    rethrowEngineGap(err);
  }
}

export async function confirmExpenseLoads(
  operatingCompanyId: string,
  body: { expense_ids: string[]; load_id?: string | null },
): Promise<{ confirmed: number }> {
  try {
    return await apiRequest<{ confirmed: number }>(
      withCompany("/api/v1/expenses/load-confirmations/confirm", operatingCompanyId),
      { method: "POST", body },
    );
  } catch (err) {
    rethrowEngineGap(err);
  }
}

export function formatProposalEvidence(ev: ExpenseLoadProposalEvidence | null | undefined): string {
  if (!ev) return "—";
  if (ev.summary && ev.summary.trim()) return ev.summary.trim();
  const parts: string[] = [];
  if (ev.truck_at_pump === true) parts.push("truck at pump");
  if (ev.gps_distance_miles != null && Number.isFinite(Number(ev.gps_distance_miles))) {
    parts.push(`${Number(ev.gps_distance_miles).toFixed(1)} mi GPS`);
  }
  if (ev.minutes_off != null && Number.isFinite(Number(ev.minutes_off))) {
    parts.push(`${Number(ev.minutes_off)} min off`);
  }
  if (ev.load_running === true) parts.push("load running");
  if (ev.load_next === true) parts.push("next load");
  return parts.length ? parts.join(" · ") : "—";
}
