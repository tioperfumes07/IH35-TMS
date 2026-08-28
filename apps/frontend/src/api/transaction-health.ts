import { apiRequest } from "./client";

/**
 * TXH-01 (SYS-F-TRANSACTION-HEALTH-REGISTER) — cross-entity, read-only transaction register.
 * Mirrors ledger-health.ts's client pattern. GET only — no resolve/close/acknowledge call exists,
 * by design (see apps/backend/src/system/transaction-health.service.ts header).
 */

export type TxHealthDocType =
  | "invoice"
  | "bill"
  | "bill_payment"
  | "customer_payment"
  | "expense"
  | "journal_entry"
  | "factoring_batch"
  | "settlement";

export type TxHealthChecks = {
  posted: boolean;
  balanced: boolean;
  linked: boolean;
  sample_consistent: boolean | null; // null = UNVERIFIABLE
};

export type TxHealthFinding = { id: string; finding_type: string; severity: string };

export type TxHealthRow = {
  doc_type: TxHealthDocType;
  id: string;
  operating_company_id: string;
  entity_code: string;
  display_label: string;
  event_at: string;
  is_sample_data: boolean | null;
  checks: TxHealthChecks;
  findings: TxHealthFinding[];
  status: "OK" | "WARN" | "FAIL";
};

export type TxHealthEntity = { id: string; code: string };

export type TxHealthResponse = {
  rows: TxHealthRow[];
  next_cursor: string | null;
  entities: TxHealthEntity[];
  generated_at: string;
};

export type GetTransactionHealthParams = {
  operatingCompanyIds?: string[];
  cursor?: string | null;
  limit?: number;
  issuesOnly?: boolean;
};

export async function getTransactionHealth(params: GetTransactionHealthParams = {}): Promise<TxHealthResponse> {
  const q = new URLSearchParams();
  for (const id of params.operatingCompanyIds ?? []) q.append("operating_company_id", id);
  if (params.cursor) q.set("cursor", params.cursor);
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.issuesOnly != null) q.set("issues_only", String(params.issuesOnly));
  const qs = q.toString();
  return apiRequest<TxHealthResponse>(`/api/v1/system/transaction-health${qs ? `?${qs}` : ""}`);
}

/** Row click → the document's own existing detail route. No new detail surface (TXH-01 spec). */
export function txHealthDocumentPath(row: Pick<TxHealthRow, "doc_type" | "id">): string {
  switch (row.doc_type) {
    case "invoice":
      return `/accounting/invoices/${row.id}`;
    case "bill":
      return `/accounting/bills/${row.id}`;
    case "bill_payment":
      return `/accounting/bill-payments/${row.id}`;
    case "customer_payment":
      return `/accounting/payments/${row.id}`;
    case "expense":
      return `/accounting/expenses/${row.id}`;
    case "journal_entry":
      return `/accounting/journal-entries/${row.id}`;
    case "factoring_batch":
      return `/factoring/batches/${row.id}`;
    case "settlement":
      return `/driver-finance/settlements?settlement_id=${row.id}`;
    default:
      return "#";
  }
}
