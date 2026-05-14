import { apiRequest, resolveApiUrl } from "./client";

export type WoConsoleRow = Record<string, unknown>;

export async function listWorkOrdersConsole(params: {
  operating_company_id: string;
  status?: "all" | "open" | "in_progress" | "completed" | "cancelled";
  wo_billing_type?: "internal" | "external";
  wo_service_class?: string;
  unit_id?: string;
  driver_id?: string;
  search?: string;
  sort?: "created_desc" | "cost_desc" | "wo_number_asc" | "labor_cost_desc";
  limit?: number;
  offset?: number;
}) {
  const qs = new URLSearchParams({ operating_company_id: params.operating_company_id });
  if (params.status) qs.set("status", params.status);
  if (params.wo_billing_type) qs.set("wo_billing_type", params.wo_billing_type);
  if (params.wo_service_class) qs.set("wo_service_class", params.wo_service_class);
  if (params.unit_id) qs.set("unit_id", params.unit_id);
  if (params.driver_id) qs.set("driver_id", params.driver_id);
  if (params.search) qs.set("search", params.search);
  if (params.sort) qs.set("sort", params.sort);
  if (params.limit !== undefined) qs.set("limit", String(params.limit));
  if (params.offset !== undefined) qs.set("offset", String(params.offset));

  return apiRequest<{
    work_orders: WoConsoleRow[];
    tab_counts: { all: number; open: number; in_progress: number; completed: number; cancelled: number };
    limit: number;
    offset: number;
  }>(`/api/v1/work-orders?${qs.toString()}`);
}

export async function getWorkOrderConsoleDetail(workOrderId: string, operatingCompanyId: string) {
  const qs = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<{ work_order: WoConsoleRow; line_items: WoConsoleRow[]; status_history: WoConsoleRow[] }>(
    `/api/v1/work-orders/${encodeURIComponent(workOrderId)}?${qs.toString()}`
  );
}

export async function approveWorkOrderConsole(workOrderId: string, operatingCompanyId: string) {
  const qs = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<{ work_order: WoConsoleRow }>(`/api/v1/work-orders/${encodeURIComponent(workOrderId)}/approve?${qs.toString()}`, {
    method: "POST",
    body: {},
  });
}

export async function startWorkOrderConsole(workOrderId: string, operatingCompanyId: string) {
  const qs = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<{ work_order: WoConsoleRow }>(`/api/v1/work-orders/${encodeURIComponent(workOrderId)}/start?${qs.toString()}`, {
    method: "POST",
    body: {},
  });
}

export async function completeWorkOrderConsole(workOrderId: string, operatingCompanyId: string) {
  const qs = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<{ work_order: WoConsoleRow }>(`/api/v1/work-orders/${encodeURIComponent(workOrderId)}/complete?${qs.toString()}`, {
    method: "POST",
    body: {},
  });
}

export async function cancelWorkOrderConsole(workOrderId: string, operatingCompanyId: string, cancellation_reason?: string) {
  const qs = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<{ work_order: WoConsoleRow }>(`/api/v1/work-orders/${encodeURIComponent(workOrderId)}/cancel?${qs.toString()}`, {
    method: "POST",
    body: { cancellation_reason: cancellation_reason ?? null },
  });
}

export async function requestWorkOrderPhotoUpload(workOrderId: string, operatingCompanyId: string, contentType: string) {
  const qs = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<{ upload_url: string; object_key: string }>(
    `/api/v1/work-orders/${encodeURIComponent(workOrderId)}/photos?${qs.toString()}`,
    {
      method: "POST",
      body: { content_type: contentType },
    }
  );
}

export async function appendWorkOrderPhotoKey(workOrderId: string, operatingCompanyId: string, objectKey: string) {
  const qs = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<{ work_order: WoConsoleRow }>(`/api/v1/work-orders/${encodeURIComponent(workOrderId)}/photos?${qs.toString()}`, {
    method: "PATCH",
    body: { object_key: objectKey },
  });
}

export function workOrderConsolePdfUrl(workOrderId: string, operatingCompanyId: string) {
  const qs = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return resolveApiUrl(`/api/v1/work-orders/${encodeURIComponent(workOrderId)}/pdf?${qs.toString()}`);
}
