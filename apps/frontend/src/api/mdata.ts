import { apiRequest } from "./client";
import type { CreateDriverInput, Driver, UpdateDriverInput } from "../types/api";

export function listDrivers(params: { status?: string; search?: string }) {
  const query = new URLSearchParams();
  if (params.status && params.status !== "All") {
    const statusValue = params.status === "Suspended" ? "Inactive" : params.status;
    query.set("status", statusValue);
  }
  if (params.search) query.set("search", params.search);
  const qs = query.toString();
  return apiRequest<{ drivers: Driver[] }>(`/api/v1/mdata/drivers${qs ? `?${qs}` : ""}`);
}

export function getDriver(id: string) {
  return apiRequest<Driver>(`/api/v1/mdata/drivers/${id}`);
}

export function createDriver(body: CreateDriverInput) {
  return apiRequest<Driver>("/api/v1/mdata/drivers", { method: "POST", body });
}

export function updateDriver(id: string, body: UpdateDriverInput) {
  return apiRequest<Driver>(`/api/v1/mdata/drivers/${id}`, { method: "PATCH", body });
}

export function deactivateDriver(id: string) {
  return apiRequest<{ id: string; deactivated_at: string | null; was_already_deactivated: boolean }>(
    `/api/v1/mdata/drivers/${id}/deactivate`,
    { method: "POST" }
  );
}

export function enableDriverPhoneLogin(id: string) {
  return apiRequest<{ ok: true; identity_user_id: string }>(`/api/v1/mdata/drivers/${id}/enable-phone-login`, { method: "POST" });
}

export function disableDriverPhoneLogin(id: string) {
  return apiRequest<{ ok: true; identity_user_id: string; changed: boolean }>(`/api/v1/mdata/drivers/${id}/disable-phone-login`, {
    method: "POST",
  });
}

type CompanyScopedListParams = {
  status?: string;
  search?: string;
  operating_company_id?: string | null;
};

function appendCompanyScopedQuery(query: URLSearchParams, params: CompanyScopedListParams) {
  if (params.status && params.status !== "All") {
    query.set("status", params.status);
  }
  if (params.search) query.set("search", params.search);
  if (params.operating_company_id) query.set("operating_company_id", params.operating_company_id);
}

export function listCustomers(params: CompanyScopedListParams = {}) {
  const query = new URLSearchParams();
  appendCompanyScopedQuery(query, params);
  const qs = query.toString();
  return apiRequest<{ customers: unknown[] }>(`/api/v1/mdata/customers${qs ? `?${qs}` : ""}`);
}

export function listVendors(params: CompanyScopedListParams = {}) {
  const query = new URLSearchParams();
  appendCompanyScopedQuery(query, params);
  const qs = query.toString();
  return apiRequest<{ vendors: unknown[] }>(`/api/v1/mdata/vendors${qs ? `?${qs}` : ""}`);
}

export function listLocations(params: CompanyScopedListParams = {}) {
  const query = new URLSearchParams();
  appendCompanyScopedQuery(query, params);
  const qs = query.toString();
  return apiRequest<{ locations: unknown[] }>(`/api/v1/mdata/locations${qs ? `?${qs}` : ""}`);
}

export function listUnits(params: { status?: string; search?: string; operating_company_id?: string | null } = {}) {
  const query = new URLSearchParams();
  if (params.status && params.status !== "All") query.set("status", params.status);
  if (params.search) query.set("search", params.search);
  if (params.operating_company_id) query.set("operating_company_id", params.operating_company_id);
  const qs = query.toString();
  return apiRequest<{ units: unknown[] }>(`/api/v1/mdata/units${qs ? `?${qs}` : ""}`);
}
