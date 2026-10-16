import { apiRequest } from "./client";

export type CatalogAccount = {
  id: string;
  account_number: string | null;
  account_name: string;
  account_type: string;
  account_subtype: string | null;
  /** catalogs.accounts.system_purpose — role tag (bank_operating, relay_fuel_wallet, …). LDT-1 reads it
   *  to decide which accounts may appear under "Paid with". */
  system_purpose?: string | null;
  /** LINK-02 — FK to catalogs.detail_types when Neon mig applied. */
  detail_type_id?: string | null;
  parent_account_id: string | null;
  qbo_account_id: string | null;
  qbo_account_qrn: string | null;
  is_postable: boolean;
  currency_code: string;
  opening_balance_cents: number | null;
  opening_balance_as_of: string | null;
  is_locked: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deactivated_at: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
};

export type CreateCatalogAccountBody = {
  account_name: string;
  account_type: string;
  account_number?: string | null;
  account_subtype?: string | null;
  detail_type_id?: string | null;
  parent_account_id?: string | null;
  is_postable?: boolean;
  currency_code?: string;
  opening_balance_cents?: number | null;
  opening_balance_as_of?: string | null;
  is_locked?: boolean;
  notes?: string | null;
  operating_company_id?: string;
};

export type UpdateCatalogAccountBody = Partial<CreateCatalogAccountBody> & {
  deactivated_at?: string | null;
};

export function createCatalogAccount(body: CreateCatalogAccountBody) {
  return apiRequest<CatalogAccount>("/api/v1/catalogs/accounts", {
    method: "POST",
    body,
  });
}

export function updateCatalogAccount(id: string, body: UpdateCatalogAccountBody) {
  return apiRequest<CatalogAccount>(`/api/v1/catalogs/accounts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body,
  });
}

export function deactivateCatalogAccountById(id: string) {
  return apiRequest<{ id: string; deactivated_at: string; was_already_deactivated: boolean }>(
    `/api/v1/catalogs/accounts/${encodeURIComponent(id)}/deactivate`,
    { method: "POST", body: {} }
  );
}

export function getCatalogAccount(id: string) {
  return apiRequest<CatalogAccount>(`/api/v1/catalogs/accounts/${encodeURIComponent(id)}`);
}

/** Named QuickBooks form-type filters of the ONE chart-of-accounts source — parameters, never a second query. */
export type ChartOfAccountsQuery = {
  /** QBO posting-target pickers (JE lines, CoA roles, expense/bill category, item income/expense account): header
   *  (non-postable) accounts are not offered. */
  postableOnly?: boolean;
  /** Default "active"; the inactive view lists deactivated rows only. */
  status?: "active" | "inactive";
  /** An explicit single page (backend clamps to <=200); omitted = the FULL chart, paged by offset. */
  limit?: number;
};

/**
 * LEAD 443.160 (owner 2026-10-16: "one function, one component, one catalog source") — THE chart-of-accounts source
 * every account picker reads (it was the Banking categorize source). listCatalogAccounts and listCoaAccountsForJe were
 * two more copies of this same paged /catalogs/accounts query; they now delegate here. Guard: verify-step 18477.
 *
 * catalogs.accounts is per-entity (af1 RLS): pass the active entity so the correct chart loads (omitting it falls back
 * to the user's default company). G9-H6: /catalogs/accounts hard-caps `limit` at 200 and returns no total, so without an
 * explicit limit the full chart is paged by offset until a short page.
 */
export async function getCoaAccounts<T = CatalogAccount>(
  operatingCompanyId?: string,
  query: ChartOfAccountsQuery = {}
): Promise<{ accounts: T[] }> {
  const params = { operating_company_id: operatingCompanyId, status: query.status ?? "active", limit: query.limit, postable_only: query.postableOnly };
  // Name locked for verify-acct-catalog-accounts-opco-scope (appendOpco). Also sends postable_only.
  const appendOpco = (qs: URLSearchParams) => {
    if (params?.operating_company_id) qs.set("operating_company_id", params.operating_company_id);
    if (params?.postable_only) qs.set("postable_only", "true");
  };
  if (params?.limit !== undefined) {
    const qs = new URLSearchParams({ status: params.status, limit: String(params.limit) });
    appendOpco(qs);
    return apiRequest<{ accounts: T[] }>(`/api/v1/catalogs/accounts?${qs.toString()}`);
  }
  const PAGE = 200;
  const accounts: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const qs = new URLSearchParams({ status: params.status, limit: String(PAGE), offset: String(offset) });
    appendOpco(qs);
    const res = await apiRequest<{ accounts: T[] }>(`/api/v1/catalogs/accounts?${qs.toString()}`);
    accounts.push(...res.accounts);
    if (res.accounts.length < PAGE) break;
  }
  return { accounts };
}

/** Delegates to the one source (443.160). Kept so its callers' shapes are unchanged. */
export function listCatalogAccounts(params?: {
  status?: string;
  limit?: number;
  /** Required for USMCA/TRANSP entity charts — omitting falls back to the user's default company. */
  operating_company_id?: string;
  /** When true, only rows with is_postable=true (posting-target pickers). */
  postable_only?: boolean;
}) {
  return getCoaAccounts<CatalogAccount>(params?.operating_company_id, {
    status: params?.status === "inactive" ? "inactive" : "active",
    postableOnly: params?.postable_only,
    limit: params?.limit,
  });
}
