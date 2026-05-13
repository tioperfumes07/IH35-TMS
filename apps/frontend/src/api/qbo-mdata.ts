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
  const plural =
    entityType === "vendor"
      ? "vendors"
      : entityType === "customer"
        ? "customers"
        : entityType === "item"
          ? "items"
          : "accounts";
  const search = new URLSearchParams();
  search.set("q", params.q);
  if (params.active_only === false) search.set("active_only", "false");
  const qs = search.toString();
  return apiRequest<QboAutocompleteResponse>(withCompany(`/api/v1/mdata/qbo/${plural}?${qs}`, operatingCompanyId));
}
