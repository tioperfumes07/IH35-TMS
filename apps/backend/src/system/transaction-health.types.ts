/**
 * Shared, dependency-free contracts for the read-only Transaction Health register.
 *
 * Keep these types outside both the query service and evidence enricher so the
 * service can call the enricher without the enricher importing back through the
 * service module.
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
  sample_consistent: boolean | null;
};

export type TxHealthLinkState = "wired" | "missing" | "not_applicable" | "blocked_by_constraint";
export type TxHealthLinkGroup = "GENERAL LEDGER" | "OPERATIONS" | "MASTER DATA";

export type TxHealthGlLine = {
  account_code: string;
  account_name: string;
  account_id: string | null;
  dr: number;
  cr: number;
};

export type TxHealthGl = null | {
  lines: TxHealthGlLine[];
  dr_total: number;
  cr_total: number;
  balanced: boolean;
};

export type TxHealthLink = {
  label: string;
  target_type: string;
  target_id: string | null;
  target_label: string | null;
  state: TxHealthLinkState;
  group: TxHealthLinkGroup;
};

export type TxHealthRow = {
  doc_type: TxHealthDocType;
  id: string;
  operating_company_id: string;
  entity_code: string;
  display_label: string;
  event_at: string;
  is_sample_data: boolean | null;
  checks: TxHealthChecks;
  findings: Array<{ id: string; finding_type: string; severity: string }>;
  status: "OK" | "WARN" | "FAIL";
  gl: TxHealthGl;
  links: TxHealthLink[];
};

export type TxHealthClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};
