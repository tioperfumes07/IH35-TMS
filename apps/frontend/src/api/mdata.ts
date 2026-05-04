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

export type PayRateChangeReason =
  | "raise"
  | "demotion"
  | "contract_renegotiation"
  | "annual_adjustment"
  | "promotion"
  | "correction"
  | "other";

export type DriverQualificationCurrentRate = {
  line_item_template_id: string;
  line_item_code: string;
  line_item_name: string;
  line_item_unit: string;
  amount: string | null;
  effective_from: string | null;
  change_reason: PayRateChangeReason | null;
};

export type DriverQualification = {
  id: string;
  equipment_type_id: string;
  equipment_type: {
    code: string;
    name: string;
  };
  is_active: boolean;
  qualified_at: string;
  notes: string | null;
  current_rates: DriverQualificationCurrentRate[];
};

export type DriverQualificationRateHistoryItem = {
  amount: string;
  effective_from: string;
  effective_to: string | null;
  change_reason: PayRateChangeReason;
  change_notes: string | null;
  created_at: string;
  created_by_user_id: string | null;
  created_by_user_email: string | null;
};

export type DriverQualificationRateHistoryLineItem = {
  line_item_template_id: string;
  line_item_code: string;
  line_item_name: string;
  history: DriverQualificationRateHistoryItem[];
};

export type DriverCompanyAuthorization = {
  id: string;
  company_id: string;
  company: {
    code: string;
    name: string;
    short_name: string | null;
  };
  is_authorized: boolean;
  authorized_at: string;
  authorized_by_user_id: string | null;
  authorized_by_user_email: string | null;
  notes: string | null;
};

export function listDriverQualifications(driverId: string) {
  return apiRequest<{ qualifications: DriverQualification[] }>(`/api/v1/mdata/drivers/${driverId}/qualifications`);
}

export function createDriverQualification(
  driverId: string,
  body: {
    equipment_type_id: string;
    qualified_at?: string;
    notes?: string;
    initial_rates?: Array<{
      line_item_template_id: string;
      amount: number;
      change_reason?: PayRateChangeReason;
      change_notes?: string;
    }>;
  }
) {
  return apiRequest<{ qualification: DriverQualification }>(`/api/v1/mdata/drivers/${driverId}/qualifications`, {
    method: "POST",
    body,
  });
}

export function updateDriverQualification(driverId: string, qualificationId: string, body: { is_active?: boolean; notes?: string }) {
  return apiRequest<{ qualification: DriverQualification }>(`/api/v1/mdata/drivers/${driverId}/qualifications/${qualificationId}`, {
    method: "PATCH",
    body,
  });
}

export function deactivateDriverQualification(driverId: string, qualificationId: string) {
  return apiRequest<{ qualification: DriverQualification }>(`/api/v1/mdata/drivers/${driverId}/qualifications/${qualificationId}`, {
    method: "PATCH",
    body: { is_active: false },
  });
}

export function getDriverQualificationRateHistory(driverId: string, qualificationId: string) {
  return apiRequest<{ line_items: DriverQualificationRateHistoryLineItem[] }>(
    `/api/v1/mdata/drivers/${driverId}/qualifications/${qualificationId}/rate-history`
  );
}

export function changeDriverQualificationRate(
  driverId: string,
  qualificationId: string,
  body: {
    line_item_template_id: string;
    amount: number;
    effective_from?: string;
    change_reason: PayRateChangeReason;
    change_notes?: string;
  }
) {
  return apiRequest<{
    rate: {
      id: string;
      driver_qualification_id: string;
      line_item_template_id: string;
      amount: string;
      effective_from: string;
      effective_to: string | null;
      change_reason: PayRateChangeReason;
      change_notes: string | null;
      previous_rate_id: string | null;
    };
  }>(`/api/v1/mdata/drivers/${driverId}/qualifications/${qualificationId}/rates/change`, {
    method: "POST",
    body,
  });
}

export function listDriverCompanyAuthorizations(driverId: string) {
  return apiRequest<{ authorizations: DriverCompanyAuthorization[] }>(`/api/v1/mdata/drivers/${driverId}/company-authorizations`);
}

export function upsertDriverCompanyAuthorization(
  driverId: string,
  body: {
    company_id: string;
    is_authorized?: boolean;
    notes?: string;
  }
) {
  return apiRequest<{ authorization: DriverCompanyAuthorization }>(`/api/v1/mdata/drivers/${driverId}/company-authorizations`, {
    method: "POST",
    body,
  });
}

export function updateDriverCompanyAuthorization(
  driverId: string,
  authorizationId: string,
  body: {
    is_authorized?: boolean;
    notes?: string;
  }
) {
  return apiRequest<{ authorization: DriverCompanyAuthorization }>(
    `/api/v1/mdata/drivers/${driverId}/company-authorizations/${authorizationId}`,
    {
      method: "PATCH",
      body,
    }
  );
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
