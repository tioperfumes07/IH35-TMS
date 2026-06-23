import { apiRequest } from "./client";

export type QboAutocompleteRow = {
  id: string;
  qbo_id: string;
  display_name: string;
  active: boolean;
  company_name?: string | null;
  primary_email?: string | null;
  primary_phone?: string | null;
  mc_number?: string | null;
  sku?: string | null;
  item_type?: string | null;
  unit_price_cents?: number | null;
  full_qualified_name?: string | null;
  account_type?: string | null;
  account_sub_type?: string | null;
};

export type QboAutocompleteResponse = {
  results: QboAutocompleteRow[];
};

function withCompany(path: string, operatingCompanyId: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}operating_company_id=${encodeURIComponent(operatingCompanyId)}`;
}

export function searchQboMasterData(
  entityType: "vendor" | "customer" | "item" | "account",
  operatingCompanyId: string,
  params: { q: string; active_only?: boolean }
) {
  if (entityType === "customer") {
    const search = new URLSearchParams();
    search.set("autocomplete", "true");
    search.set("q", params.q);
    if (params.active_only === false) search.set("active_only", "false");
    return apiRequest<QboAutocompleteResponse>(withCompany(`/api/v1/mdata/customers?${search.toString()}`, operatingCompanyId));
  }

  const plural =
    entityType === "vendor"
      ? "vendors"
      : entityType === "item"
          ? "items"
          : "accounts";
  const search = new URLSearchParams();
  search.set("q", params.q);
  if (params.active_only === false) search.set("active_only", "false");
  const qs = search.toString();
  return apiRequest<QboAutocompleteResponse>(withCompany(`/api/v1/mdata/qbo/${plural}?${qs}`, operatingCompanyId));
}

export function createQboVendor(
  operatingCompanyId: string,
  body: {
    display_name: string;
    company_name?: string;
    primary_email?: string;
    primary_phone?: string;
    // W-FIX-7b: render-v5 §D fields (mig 202606231500).
    billing_address_line1?: string;
    billing_city?: string;
    billing_state?: string;
    billing_postal_code?: string;
    account_number?: string;
    terms?: string;
    tax_id?: string;
    track_1099?: boolean;
    default_expense_account_qbo_id?: string;
  }
) {
  return apiRequest<{ vendor: { id: string } }>(`/api/v1/mdata/qbo/vendors`, {
    method: "POST",
    body: { operating_company_id: operatingCompanyId, ...body },
  });
}

export function createQboCustomer(
  operatingCompanyId: string,
  body: { display_name: string; company_name?: string; primary_email?: string; primary_phone?: string; mc_number?: string }
) {
  return apiRequest<{ customer: { id: string } }>(`/api/v1/mdata/qbo/customers`, {
    method: "POST",
    body: { operating_company_id: operatingCompanyId, ...body },
  });
}

export function createQboItem(
  operatingCompanyId: string,
  body: { name: string; sku?: string; unit_price_cents?: number; income_account_qbo_id: string }
) {
  return apiRequest<{ item: { id: string } }>(`/api/v1/mdata/qbo/items`, {
    method: "POST",
    body: { operating_company_id: operatingCompanyId, ...body },
  });
}

export function createQboAccount(
  operatingCompanyId: string,
  body: { name: string; account_type: string; account_sub_type?: string; full_qualified_name?: string }
) {
  return apiRequest<{ account: { id: string } }>(`/api/v1/mdata/qbo/accounts`, {
    method: "POST",
    body: { operating_company_id: operatingCompanyId, ...body },
  });
}
