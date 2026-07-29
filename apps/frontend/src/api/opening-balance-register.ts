import { apiRequest } from "./client";

/**
 * OB-01 Opening Balance Register client.
 *
 * Owner ruling 2026-07-29: opening balances are LIVE and CHANGE — there is no finality gate. Import →
 * staging → commit, three columns per account (QBO Snapshot | editable Adjustment | Adjusted Opening =
 * Snapshot + Adjustment, the committed value). Re-import refreshes the Snapshot only; a prior
 * Adjustment persists. The commit still refuses when the register does not balance, Opening Balance
 * Equity has not been reclassed, a line sits on a non-balance-sheet account, or (for a human commit)
 * the checker is also a maker. Nothing here posts a journal entry and nothing writes to QuickBooks.
 */
export type ObCommitBlocker =
  | "no_staged_lines"
  | "maker_is_checker"
  | "unbalanced"
  | "obe_not_reclassed"
  | "non_balance_sheet_account_type";

export type ObRegisterLine = {
  id: string | null;
  account_id: string;
  account_number: string | null;
  account_name: string;
  account_type: string | null;
  /** QBO/fixture snapshot as last imported. NULL when this line has never been imported. */
  qbo_snapshot_cents: number | null;
  /** Owner/accountant editable layer on top of the snapshot. Persists across re-import. */
  adjustment_cents: number;
  /** Adjusted Opening = coalesce(qbo_snapshot_cents, 0) + adjustment_cents — the committed value. */
  amount_cents: number;
  source: "manual" | "qbo_import";
  source_account_label: string | null;
  qbo_account_id: string | null;
  status: "staged" | "committed" | "superseded";
  note: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  updated_at: string | null;
  posted_opening_balance_cents: number | null;
  posted_opening_balance_as_of: string | null;
  debit_or_credit: "debit" | "credit" | null;
};

export type ObRegisterView = {
  operating_company_id: string;
  company_code: string;
  as_of_date: string;
  import_source: "qbo" | "manual_only";
  period_basis: string;
  qbo_import_flag_on: boolean;
  qbo_connection_present: boolean;
  finality: {
    is_final: boolean;
    as_of_date: string;
    set_by_user_id: string | null;
    set_by_name: string | null;
    set_at: string | null;
    note: string | null;
  };
  lines: ObRegisterLine[];
  totals: {
    total_debits_cents: number;
    total_credits_cents: number;
    is_balanced: boolean;
    obe_residual_cents: number;
    retained_earnings_cents: number;
    obe_is_reclassed: boolean;
    staged_line_count: number;
    non_zero_line_count: number;
  };
  je_preview: {
    entry_date: string;
    memo: string;
    postings: Array<{ account_id: string; debit_or_credit: "debit" | "credit"; amount_cents: number; description: string }>;
  } | null;
  commit_blockers: ObCommitBlocker[];
  makers: string[];
};

export type ObAuditEvent = {
  id: string;
  event_type: string;
  actor_user_id: string | null;
  actor_name: string | null;
  account_name: string | null;
  detail: string | null;
  before_json: unknown;
  after_json: unknown;
  created_at: string;
};

export function getOpeningBalanceRegister(operatingCompanyId: string) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<ObRegisterView>(`/api/v1/accounting/opening-balance-register?${q}`);
}

export function getOpeningBalanceRegisterAudit(operatingCompanyId: string) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<{ events: ObAuditEvent[] }>(`/api/v1/accounting/opening-balance-register/audit?${q}`);
}

export function patchOpeningBalanceLine(input: {
  operating_company_id: string;
  account_id: string;
  adjustment_cents: number;
  note?: string | null;
}) {
  return apiRequest<{ line: ObRegisterLine }>("/api/v1/accounting/opening-balance-register/line", {
    method: "PATCH",
    body: input,
  });
}

export function importOpeningBalancesFromQbo(operatingCompanyId: string) {
  return apiRequest<{
    as_of_date: string;
    company_code: string;
    realm_id: string;
    staged_count: number;
    mapped_count: number;
    unmapped: Array<{ qbo_account_id: string; report_account_name: string; reason: string }>;
  }>("/api/v1/accounting/opening-balance-register/import-from-qbo", {
    method: "POST",
    body: { operating_company_id: operatingCompanyId },
  });
}

/** TRANSP-only — imports docs/fixtures/ob01/transp-2026-03-31.json into staging. */
export function importOpeningBalancesFromFixture(operatingCompanyId: string) {
  return apiRequest<{
    as_of_date: string;
    company_code: string;
    staged_count: number;
    mapped_count: number;
    unmapped: Array<{ qbo_account_name: string; reason: string }>;
  }>("/api/v1/accounting/opening-balance-register/import-from-fixture", {
    method: "POST",
    body: { operating_company_id: operatingCompanyId },
  });
}

/** Owner ruling 2026-07-29: import (QBO if connected, else the TRANSP fixture) AND commit now. */
export function cloneAsIsImportAndCommit(operatingCompanyId: string) {
  return apiRequest<{
    as_of_date: string;
    company_code: string;
    import_source: "qbo" | "fixture";
    staged_count: number;
    mapped_count: number;
    unmapped: Array<{ reason: string; [key: string]: unknown }>;
    commit: {
      committed: boolean;
      as_of_date: string;
      company_code: string;
      accounts_written: number;
      blockers?: ObCommitBlocker[];
    };
  }>("/api/v1/accounting/opening-balance-register/clone-as-is-commit", {
    method: "POST",
    body: { operating_company_id: operatingCompanyId },
  });
}

export function setOpeningBalanceSourceFinality(input: {
  operating_company_id: string;
  is_final: boolean;
  note?: string | null;
}) {
  return apiRequest<{ finality: ObRegisterView["finality"] }>(
    "/api/v1/accounting/opening-balance-register/finality",
    { method: "POST", body: input },
  );
}

export function commitOpeningBalanceRegister(operatingCompanyId: string) {
  return apiRequest<{
    committed: true;
    as_of_date: string;
    company_code: string;
    accounts_written: number;
  }>("/api/v1/accounting/opening-balance-register/commit", {
    method: "POST",
    body: { operating_company_id: operatingCompanyId },
  });
}
