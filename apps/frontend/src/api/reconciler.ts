import { apiRequest } from "./client";

export type ReconcilerEntityType = "load" | "recovery_link" | "invoice_dispute";

export type ReconcilerException = {
  key: string;
  invariant: string;
  entity_type: ReconcilerEntityType;
  entity_id: string;
  entity_label: string;
  field: string;
  reason: string;
  since: string;
  since_source: string;
  owner_seat: string;
  repair_engine: string | null;
  amount_cents?: number | null;
  amount_source?: string | null;
};

export type ReconcilerInvariantResult =
  | { invariant: string; title: string; status: "ok"; exceptions: ReconcilerException[] }
  | { invariant: string; title: string; status: "error"; error: string; exceptions: [] };

export type ReconcilerRun = {
  operating_company_id: string;
  ran_at: string;
  results: ReconcilerInvariantResult[];
  exception_count: number;
  errored_invariants: string[];
};

/** Read-only: GET /api/v1/reconciler/exceptions runs every invariant live in a read-only transaction. */
export async function fetchReconcilerExceptions(operatingCompanyId: string, signal?: AbortSignal) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<ReconcilerRun>(`/api/v1/reconciler/exceptions?${q}`, { signal });
}
