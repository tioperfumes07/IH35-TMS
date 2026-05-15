import { apiRequest } from "./client";

export function batchCategorizeVendors(body: {
  operating_company_id: string;
  vendor_ids: string[];
  category: string;
  lock?: boolean;
}) {
  return apiRequest<{ updated: number; skipped: Array<{ id: string; reason: string }> }>("/api/v1/accounting/vendors/batch-categorize", {
    method: "POST",
    body,
  });
}

export function patchVendorAccountingCategory(
  vendorId: string,
  body: { operating_company_id: string; category: string; lock?: boolean }
) {
  return apiRequest<Record<string, unknown>>(`/api/v1/accounting/vendors/${encodeURIComponent(vendorId)}/category`, {
    method: "PATCH",
    body,
  });
}
