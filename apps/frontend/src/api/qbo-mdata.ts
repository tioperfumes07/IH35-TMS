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
  // Customer + vendor pickers read the CANONICAL master tables (mdata.customers / mdata.vendors) via
  // their autocomplete mode, so records created through the canonical writer are immediately selectable
  // (fixes the "create → disappears" split where writers wrote the real table but the picker read the
  // mdata.qbo_* mirror). Only accounts still read the mirror (catalogs.accounts = CoA = financial, HELD).
  if (entityType === "customer" || entityType === "vendor") {
    const search = new URLSearchParams();
    search.set("autocomplete", "true");
    search.set("q", params.q);
    if (params.active_only === false) search.set("active_only", "false");
    const path = entityType === "customer" ? "/api/v1/mdata/customers" : "/api/v1/mdata/vendors";
    return apiRequest<QboAutocompleteResponse>(withCompany(`${path}?${search.toString()}`, operatingCompanyId));
  }

  // Item (product/service) picker reads the CANONICAL catalogs.items via its existing list endpoint,
  // mapped to the autocomplete shape — so a service created through the canonical writer (#2273) is
  // selectable. Frontend-mapped (catalogs scoping differs from mdata's) to avoid touching that endpoint.
  if (entityType === "item") {
    const itemSearch = new URLSearchParams();
    if (params.q) itemSearch.set("search", params.q);
    if (params.active_only !== false) itemSearch.set("status", "active");
    return apiRequest<{
      items: Array<{
        id: string;
        item_name: string;
        item_code: string | null;
        item_type: string | null;
        unit_price_cents: number | null;
        qbo_item_id: string | null;
        deactivated_at: string | null;
      }>;
    }>(withCompany(`/api/v1/catalogs/items?${itemSearch.toString()}`, operatingCompanyId)).then((resp) => ({
      results: resp.items.map((i) => ({
        id: i.id,
        qbo_id: i.qbo_item_id ?? "",
        display_name: i.item_name,
        active: i.deactivated_at == null,
        sku: i.item_code ?? null,
        item_type: i.item_type ?? null,
        unit_price_cents: i.unit_price_cents ?? null,
      })),
    }));
  }

  // Accounts still read the qbo mirror pending catalogs.accounts canonical autocomplete (financial / HELD).
  const search = new URLSearchParams();
  search.set("q", params.q);
  if (params.active_only === false) search.set("active_only", "false");
  const qs = search.toString();
  return apiRequest<QboAutocompleteResponse>(withCompany(`/api/v1/mdata/qbo/accounts?${qs}`, operatingCompanyId));
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
