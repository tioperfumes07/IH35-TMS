import { apiRequest } from "./client";
import { itemsCatalogClient } from "./catalogs-accounting";

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
  entityType: "vendor" | "customer" | "item",
  operatingCompanyId: string,
  params: { q: string; active_only?: boolean }
) {
  // Customer + vendor pickers read the CANONICAL master tables (mdata.customers / mdata.vendors) via
  // their autocomplete mode, so records created through the canonical writer are immediately selectable
  // (fixes the "create → disappears" split where writers wrote the real table but the picker read the
  // mdata.qbo_* mirror). Accounts never read the mirror (443.160: ./catalog-accounts getCoaAccounts).
  if (entityType === "customer" || entityType === "vendor") {
    const search = new URLSearchParams();
    search.set("autocomplete", "true");
    search.set("q", params.q);
    if (params.active_only === false) search.set("active_only", "false");
    const path = entityType === "customer" ? "/api/v1/mdata/customers" : "/api/v1/mdata/vendors";
    return apiRequest<QboAutocompleteResponse>(withCompany(`${path}?${search.toString()}`, operatingCompanyId));
  }

  // LEAD 443.160 — items come from the ONE item source every item picker reads (itemsCatalogClient,
  // /catalogs/accounting/items over catalogs.items), mapped to the autocomplete shape. The second item endpoint
  // (/catalogs/items) and the dead "account" branch (it read the mdata.qbo_accounts mirror — a second chart of
  // accounts no caller used) are gone; accounts come from ./catalog-accounts getCoaAccounts.
  return itemsCatalogClient
    .list({ operating_company_id: operatingCompanyId, search: params.q || undefined, is_active: params.active_only === false ? "all" : "true", limit: 50 }) // typeahead page, as before
    .then((resp) => ({
      results: resp.rows.map((r) => ({
        id: r.id,
        qbo_id: String(r.metadata?.qbo_item_id ?? ""),
        display_name: r.display_name,
        active: r.is_active,
        sku: r.code ?? null,
        item_type: (r.metadata?.item_type as string | null | undefined) ?? null,
        unit_price_cents: r.metadata?.unit_price_cents == null ? null : Number(r.metadata.unit_price_cents),
      })),
    }));
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
