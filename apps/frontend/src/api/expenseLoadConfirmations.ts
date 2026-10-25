/**
 * 443.288-C — Expense load confirmations queue API (ruling contract).
 * LEAD 443.301: bound to CC-2's 443.288-B engine as shipped (#27460, e2048ed4b4) —
 *   GET  /api/v1/accounting/expense-load-confirmations   (comma lists driver_ids / unit_ids / load_ids / vendor_ids / settlement_ids)
 *   POST /api/v1/accounting/expense-load-confirmations/confirm   { operating_company_id, items: [{ expense_id, load_id? }] }
 * The screen keeps its own row shape; this module maps the engine rows onto it (one place, no re-derivation).
 * A 404/501 still fails closed (≠ empty / confirmed).
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
  /** One status, a list (multi-select law), or "all"; an empty list means all. */
  status?: ExpenseLoadConfirmationStatus | "all" | ExpenseLoadConfirmationStatus[];
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

/** Engine row as returned by GET /api/v1/accounting/expense-load-confirmations (443.288-B). */
type EngineRow = {
  expense_id: string; expense_number: string | null; date: string; amount_cents: number | string;
  load_confirmation: ExpenseLoadConfirmationStatus; evidence: ExpenseLoadProposalEvidence | null;
  confirmed_by_user_id: string | null; load_confirmed_at: string | null;
  vendor_id: string | null; vendor_name: string | null; driver_id: string | null; driver_name: string | null;
  unit_id: string | null; unit_number: string | null; load_id: string | null; load_number: string | null;
  settlements: Array<{ settlement_id: string; display_id: string | null }> | null;
};

/** Map one engine row onto the screen's row shape. Exported for the contract test. */
export function fromEngineRow(r: EngineRow): ExpenseLoadConfirmationRow {
  const first = Array.isArray(r.settlements) && r.settlements.length ? r.settlements[0] : null;
  return {
    id: r.expense_id, expense_number: r.expense_number, transaction_date: r.date, amount_cents: r.amount_cents,
    load_confirmation: r.load_confirmation, load_id: r.load_id, load_number: r.load_number,
    driver_id: r.driver_id, driver_name: r.driver_name, unit_id: r.unit_id, unit_number: r.unit_number,
    vendor_id: r.vendor_id, vendor_name: r.vendor_name,
    settlement_id: first?.settlement_id ?? null, settlement_number: first?.display_id ?? null,
    proposal_evidence: r.evidence, confirmed_by_user_id: r.confirmed_by_user_id, confirmed_at: r.load_confirmed_at,
  };
}

const ENGINE = "/api/v1/accounting/expense-load-confirmations";

export async function listExpenseLoadConfirmations(
  operatingCompanyId: string,
  params: ListExpenseLoadConfirmationsParams = {},
): Promise<{ rows: ExpenseLoadConfirmationRow[]; total_count?: number }> {
  const query = new URLSearchParams();
  const st = params.status ?? "proposed";
  query.set("status", Array.isArray(st) ? (st.length > 0 ? st.join(",") : "all") : st);
  // Filters are comma-separated id lists (multi-select law); the engine takes *_ids.
  if (params.driver_id) query.set("driver_ids", params.driver_id);
  if (params.unit_id) query.set("unit_ids", params.unit_id);
  if (params.load_id) query.set("load_ids", params.load_id);
  if (params.vendor_uuid) query.set("vendor_ids", params.vendor_uuid);
  if (params.settlement_id) query.set("settlement_ids", params.settlement_id);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  try {
    const res = await apiRequest<{ rows: EngineRow[]; total_count?: number }>(withCompany(`${ENGINE}?${query.toString()}`, operatingCompanyId));
    return { rows: (res.rows ?? []).map(fromEngineRow), total_count: res.total_count };
  } catch (err) {
    rethrowEngineGap(err);
  }
}

export async function confirmExpenseLoads(
  operatingCompanyId: string,
  body: { expense_ids: string[]; load_id?: string | null },
): Promise<{ confirmed: number; moved?: number }> {
  try {
    return await apiRequest<{ confirmed: number; moved?: number }>(withCompany(`${ENGINE}/confirm`, operatingCompanyId), {
      method: "POST",
      body: {
        operating_company_id: operatingCompanyId,
        items: body.expense_ids.map((expense_id) => (body.load_id ? { expense_id, load_id: body.load_id } : { expense_id })),
      },
    });
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
