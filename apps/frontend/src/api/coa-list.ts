import { apiRequest } from "./client";

export type AccountTypeCatalogEntry = {
  id: string;
  code: string;
  accountType: string;
  group: string;
  statement: string;
  normalBalance: string;
  defaultAction: string;
  sortOrder: number;
  detailTypes: Array<{ id: string; name: string; sortOrder: number }>;
};

export type AccountBalanceRow = {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  normal_balance: "debit" | "credit";
  opening_balance_cents: number | null;
  period_debits_cents: number;
  period_credits_cents: number;
  period_activity_cents: number;
  closing_balance_cents: number;
};

export type AccountBalancesReport = {
  accounts: AccountBalanceRow[];
  as_of_date: string;
  from_date: string | null;
  basis: "accrual" | "cash";
  generated_at: string;
};

export function fetchAccountTypeCatalog(operatingCompanyId?: string | null) {
  const params = new URLSearchParams();
  if (operatingCompanyId) params.set("operating_company_id", operatingCompanyId);
  const qs = params.toString();
  return apiRequest<AccountTypeCatalogEntry[]>(
    `/api/v1/accounting/account-type-catalog${qs ? `?${qs}` : ""}`,
  );
}

// ── Shared COA account-type taxonomy ────────────────────────────────────────────────────────────
// catalogs.accounts.account_type is often the 8-value COA group enum on historical rows; create UIs
// pick the ~15 QBO finer types (codes BANK/AR/EXP/…) from fetchAccountTypeCatalog and persist the
// catalog code. Parent filters map code → 8-enum via catalogCodeToCoaEnum. Shared by AccountDrawer,
// NewAccountDrawerForm, and QuickCreate category so the three never drift (§9).
export const ACCOUNT_TYPES = [
  "Asset",
  "Liability",
  "Equity",
  "Income",
  "Expense",
  "CostOfGoodsSold",
  "OtherIncome",
  "OtherExpense",
] as const;

export type CoaAccountType = (typeof ACCOUNT_TYPES)[number];

// QBO groups the account-type picker under its two financial statements (Balance Sheet vs Profit &
// Loss). Same 8 enum values, presented in statement-grouped <optgroup>s. The stored value is still
// the flat account_type enum.
export const ACCOUNT_TYPE_GROUPS: Array<{ label: string; types: CoaAccountType[] }> = [
  { label: "Balance Sheet", types: ["Asset", "Liability", "Equity"] },
  { label: "Profit & Loss", types: ["Income", "CostOfGoodsSold", "Expense", "OtherIncome", "OtherExpense"] },
];

// catalogs.accounts.account_type is the 8-value COA group enum, but the account-type catalog
// (catalogs.account_types) is keyed by the 15 finer QBO types (codes BANK/AR/OCA/EXP/…). Map each
// enum to its catalog code(s) so the dependent Detail Type dropdown populates.
export const COA_ENUM_TO_CATALOG_CODES: Record<string, string[]> = {
  Asset: ["BANK", "AR", "OCA", "FA", "OA"],
  Liability: ["CC", "AP", "OCL", "LTL"],
  Equity: ["EQ"],
  Income: ["INC"],
  OtherIncome: ["OINC"],
  CostOfGoodsSold: ["COGS"],
  Expense: ["EXP"],
  OtherExpense: ["OEXP"],
};

// Detail types available for a chosen account_type enum, derived from the LIVE account-type catalog.
export function detailTypesForAccountType(
  catalog: AccountTypeCatalogEntry[] | undefined,
  accountType: string,
): AccountTypeCatalogEntry["detailTypes"] {
  if (!catalog || !accountType) return [];
  const codes = new Set(COA_ENUM_TO_CATALOG_CODES[accountType] ?? []);
  const out: AccountTypeCatalogEntry["detailTypes"] = [];
  const seen = new Set<string>();
  for (const e of catalog) {
    if (!(codes.has(e.code) || e.accountType === accountType || e.code === accountType)) continue;
    for (const dt of e.detailTypes) {
      if (seen.has(dt.name)) continue;
      seen.add(dt.name);
      out.push(dt);
    }
  }
  return out;
}

/** Map a QBO catalog code (BANK) or legacy 8-enum (Asset) → the 8-value group used on catalogs.accounts rows. */
export function catalogCodeToCoaEnum(codeOrEnum: string): string {
  if ((ACCOUNT_TYPES as readonly string[]).includes(codeOrEnum)) return codeOrEnum;
  for (const [enumVal, codes] of Object.entries(COA_ENUM_TO_CATALOG_CODES)) {
    if (codes.includes(codeOrEnum)) return enumVal;
  }
  return codeOrEnum;
}

/**
 * QBO Account Type picker groups — Balance Sheet / P&L optgroups of the ~15 finer types
 * (Bank, Accounts receivable, …) from the live account-type catalog. Falls back to the
 * 8 GAAP enums only when the catalog has not loaded yet.
 */
export function accountTypePickerGroupsFromCatalog(
  catalog: AccountTypeCatalogEntry[] | undefined,
): Array<{ label: string; options: Array<{ value: string; label: string }> }> {
  if (!catalog?.length) {
    return ACCOUNT_TYPE_GROUPS.map((group) => ({
      label: group.label,
      options: group.types.map((t) => ({ value: t, label: t })),
    }));
  }
  const statementLabel = (statement: string) =>
    statement === "BS" || /balance/i.test(statement) ? "Balance Sheet" : "Profit & Loss";
  const buckets = new Map<string, Array<{ value: string; label: string }>>();
  for (const entry of [...catalog].sort((a, b) => a.sortOrder - b.sortOrder || a.accountType.localeCompare(b.accountType))) {
    const label = statementLabel(entry.statement || "");
    const list = buckets.get(label) ?? [];
    list.push({ value: entry.code, label: entry.accountType || entry.code });
    buckets.set(label, list);
  }
  return ["Balance Sheet", "Profit & Loss"]
    .filter((label) => buckets.has(label))
    .map((label) => ({ label, options: buckets.get(label)! }));
}

/** Detail types for a picker selection that is either a catalog code (BANK) or a legacy 8-enum. */
export function detailTypesForAccountTypeSelection(
  catalog: AccountTypeCatalogEntry[] | undefined,
  selection: string,
): AccountTypeCatalogEntry["detailTypes"] {
  if (!catalog || !selection) return [];
  const exact = catalog.find((e) => e.code === selection || e.accountType === selection);
  if (exact) return exact.detailTypes;
  return detailTypesForAccountType(catalog, selection);
}

/** Resolve the catalog row for a picker selection (+ optional detail name). */
export function resolveAccountTypeCatalogEntry(
  catalog: AccountTypeCatalogEntry[] | undefined,
  selection: string,
  detailName?: string,
): AccountTypeCatalogEntry | null {
  if (!catalog || !selection) return null;
  const exact = catalog.find((e) => e.code === selection || e.accountType === selection);
  if (exact) return exact;
  const codes = new Set(COA_ENUM_TO_CATALOG_CODES[selection] ?? []);
  const matches = catalog.filter(
    (e) => codes.has(e.code) || e.accountType === selection || e.code === selection,
  );
  if (matches.length === 0) return null;
  if (detailName) {
    const withDetail = matches.find((e) => e.detailTypes.some((dt) => dt.name === detailName));
    if (withDetail) return withDetail;
  }
  return matches[0];
}

/**
 * Normalize a stored catalogs.accounts.account_type (often the 8-enum) to the catalog CODE
 * the QBO picker uses, preferring the row that owns detailTypeId when present.
 */
export function resolveAccountTypePickerValue(
  catalog: AccountTypeCatalogEntry[] | undefined,
  storedAccountType: string,
  detailTypeId?: string,
  detailName?: string,
): string {
  if (!storedAccountType) return "";
  if (!catalog?.length) return storedAccountType;
  if (catalog.some((e) => e.code === storedAccountType)) return storedAccountType;
  if (detailTypeId) {
    for (const e of catalog) {
      if (e.detailTypes.some((dt) => dt.id === detailTypeId)) return e.code;
    }
  }
  if (detailName) {
    for (const e of catalog) {
      if (e.detailTypes.some((dt) => dt.name === detailName)) return e.code;
    }
  }
  const codes = COA_ENUM_TO_CATALOG_CODES[storedAccountType];
  if (codes?.length) {
    const hit = catalog.find((e) => codes.includes(e.code));
    if (hit) return hit.code;
  }
  return storedAccountType;
}

export function fetchAccountBalances(operatingCompanyId: string, asOfDate: string) {
  const params = new URLSearchParams({
    operating_company_id: operatingCompanyId,
    as_of_date: asOfDate,
    basis: "accrual",
  });
  return apiRequest<AccountBalancesReport>(`/api/v1/accounting/account-balances?${params.toString()}`);
}

export function deactivateCatalogAccount(accountId: string) {
  return apiRequest<{ id: string; deactivated_at: string; was_already_deactivated: boolean }>(
    `/api/v1/catalogs/accounts/${encodeURIComponent(accountId)}/deactivate`,
    { method: "POST", body: {} }
  );
}

// ── ACCT-R-03 — real Chart-of-Accounts merge ────────────────────────────────────────────────────
// The COA list's "Merge accounts" action used to loop deactivateCatalogAccount over the sources, so
// child accounts and every config pointer kept designating an archived account. This calls the real
// merge endpoint (blueprint MUST 3.18.4.3): reparent children, remount config pointers, write the
// append-only merge record, archive the source. Historical postings stay on the source by design.
export const COA_MERGE_REASON_MIN_LENGTH = 20;

export type CoaMergeSourceResult = {
  merge_record_id: string;
  source_account_id: string;
  source_account_number: string | null;
  source_account_name: string | null;
  reparented_child_account_count: number;
  remounted_reference_counts: Record<string, number>;
  deactivated_at: string | null;
};

export type CoaMergeResponse = {
  target_account_id: string;
  operating_company_id: string;
  migrate_historical_postings: boolean;
  merged: CoaMergeSourceResult[];
};

export function mergeCatalogAccounts(input: {
  targetAccountId: string;
  sourceAccountIds: string[];
  operatingCompanyId: string;
  reason: string;
}) {
  return apiRequest<CoaMergeResponse>(
    `/api/v1/catalogs/accounts/${encodeURIComponent(input.targetAccountId)}/merge`,
    {
      method: "POST",
      body: {
        source_account_ids: input.sourceAccountIds,
        reason: input.reason,
        // Blueprint MUST 3.18.7.1 — history is immutable. The server refuses `true`; the UI never
        // offers it, so the two can't drift into a false promise.
        migrate_historical_postings: false,
        operating_company_id: input.operatingCompanyId,
      },
    }
  );
}
