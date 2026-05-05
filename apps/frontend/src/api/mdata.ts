import { apiRequest } from "./client";
import type { CreateDriverInput, CustomerType, Driver, MilesBasis, UpdateDriverInput } from "../types/api";

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
  | "initial_hire"
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
  deactivated_at?: string | null;
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
  was_corrected: boolean;
  deactivated_at: string | null;
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

export type Customer = {
  id: string;
  name: string;
  customer_code: string | null;
  email: string | null;
  phone: string | null;
  billing_address: string | null;
  mc_number: string | null;
  dot_number: string | null;
  tax_id: string | null;
  credit_limit: string | null;
  payment_terms_id: string | null;
  operating_company_id: string;
  customer_type: CustomerType | null;
  status: "active" | "inactive" | "credit_hold" | "blacklist";
  default_billing_miles_basis: MilesBasis;
  default_free_time_hours: string;
  default_detention_rate: string;
  notes: string | null;
  website: string | null;
  office_phone: string | null;
  fax_phone: string | null;
  main_contact_name: string | null;
  main_contact_title: string | null;
  main_contact_email: string | null;
  main_contact_phone: string | null;
  main_contact_mobile: string | null;
  ar_email: string | null;
  ar_phone: string | null;
  ap_email: string | null;
  ap_phone: string | null;
  free_time_pickup_minutes: number;
  free_time_delivery_minutes: number;
  detention_rate_per_hour: string;
  created_at: string;
  updated_at: string;
  deactivated_at: string | null;
  created_by_user_id: string;
  updated_by_user_id: string;
};

export type CreateCustomerInput = {
  name: string;
  customer_code?: string;
  email?: string;
  phone?: string;
  billing_address?: string;
  mc_number?: string;
  dot_number?: string;
  tax_id?: string;
  credit_limit?: number;
  payment_terms_id?: string | null;
  operating_company_id?: string;
  customer_type?: CustomerType;
  status?: "active" | "inactive" | "credit_hold" | "blacklist";
  default_billing_miles_basis?: MilesBasis;
  default_free_time_hours?: number;
  default_detention_rate?: number;
  notes?: string;
  website?: string;
  office_phone?: string;
  fax_phone?: string;
  main_contact_name?: string;
  main_contact_title?: string;
  main_contact_email?: string;
  main_contact_phone?: string;
  main_contact_mobile?: string;
  ar_email?: string;
  ar_phone?: string;
  ap_email?: string;
  ap_phone?: string;
  free_time_pickup_minutes?: number;
  free_time_delivery_minutes?: number;
  detention_rate_per_hour?: number;
};

export type UpdateCustomerInput = Partial<{
  name: string;
  customer_code: string | null;
  email: string | null;
  phone: string | null;
  billing_address: string | null;
  mc_number: string | null;
  dot_number: string | null;
  tax_id: string | null;
  credit_limit: number | null;
  payment_terms_id: string | null;
  operating_company_id: string;
  customer_type: CustomerType | null;
  status: "active" | "inactive" | "credit_hold" | "blacklist";
  status_change_reason: string;
  default_billing_miles_basis: MilesBasis;
  default_free_time_hours: number;
  default_detention_rate: number;
  notes: string | null;
  website: string | null;
  office_phone: string | null;
  fax_phone: string | null;
  main_contact_name: string | null;
  main_contact_title: string | null;
  main_contact_email: string | null;
  main_contact_phone: string | null;
  main_contact_mobile: string | null;
  ar_email: string | null;
  ar_phone: string | null;
  ap_email: string | null;
  ap_phone: string | null;
  free_time_pickup_minutes: number;
  free_time_delivery_minutes: number;
  detention_rate_per_hour: number;
  deactivated_at: string | null;
}>;

export type CustomerContactDepartment = "sales" | "billing" | "dispatch" | "operations" | "owner" | "other";

export type CustomerContact = {
  id: string;
  customer_id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  department: CustomerContactDepartment;
  is_primary: boolean;
  notes: string | null;
  deactivated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PaymentTermOption = {
  id: string;
  terms_name: string;
  days_until_due: number;
};

export function listDriverQualifications(driverId: string, includeInactive?: boolean) {
  const query = includeInactive ? "?include_inactive=true" : "";
  return apiRequest<{ qualifications: DriverQualification[] }>(`/api/v1/mdata/drivers/${driverId}/qualifications${query}`);
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

export function reactivateQualification(driverId: string, qualificationId: string) {
  return apiRequest<{
    qualification: DriverQualification & {
      rates_restored: Array<{
        line_item_template_id: string;
        amount: string;
        action: "reopened" | "reactivated";
      }>;
    };
  }>(`/api/v1/mdata/drivers/${driverId}/qualifications/${qualificationId}/reactivate`, {
    method: "POST",
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
  return apiRequest<{ customers: Customer[] }>(`/api/v1/mdata/customers${qs ? `?${qs}` : ""}`);
}

export function createCustomer(body: CreateCustomerInput) {
  return apiRequest<Customer>("/api/v1/mdata/customers", { method: "POST", body });
}

export function updateCustomer(id: string, body: UpdateCustomerInput) {
  return apiRequest<Customer>(`/api/v1/mdata/customers/${id}`, { method: "PATCH", body });
}

export function getCustomerDetail(id: string) {
  return apiRequest<{ customer: Customer & { contacts: CustomerContact[] } }>(`/api/v1/mdata/customers/${id}/detail`);
}

export function listCustomerContacts(customerId: string, includeInactive = false) {
  const query = includeInactive ? "?include_inactive=true" : "";
  return apiRequest<{ contacts: CustomerContact[] }>(`/api/v1/mdata/customers/${customerId}/contacts${query}`);
}

export function createCustomerContact(
  customerId: string,
  payload: {
    name: string;
    title?: string;
    email?: string;
    phone?: string;
    mobile?: string;
    department?: CustomerContactDepartment;
    is_primary?: boolean;
    notes?: string;
  }
) {
  return apiRequest<{ contact: CustomerContact }>(`/api/v1/mdata/customers/${customerId}/contacts`, { method: "POST", body: payload });
}

export function updateCustomerContact(
  customerId: string,
  contactId: string,
  payload: Partial<{
    name: string;
    title: string | null;
    email: string | null;
    phone: string | null;
    mobile: string | null;
    department: CustomerContactDepartment;
    is_primary: boolean;
    notes: string | null;
  }>
) {
  return apiRequest<{ contact: CustomerContact }>(`/api/v1/mdata/customers/${customerId}/contacts/${contactId}`, {
    method: "PATCH",
    body: payload,
  });
}

export function deactivateCustomerContact(customerId: string, contactId: string) {
  return apiRequest<{ ok: true }>(`/api/v1/mdata/customers/${customerId}/contacts/${contactId}`, {
    method: "DELETE",
  });
}

export function reactivateCustomerContact(customerId: string, contactId: string) {
  return apiRequest<{ ok: true }>(`/api/v1/mdata/customers/${customerId}/contacts/${contactId}/reactivate`, {
    method: "POST",
  });
}

export function listPaymentTermOptions() {
  return apiRequest<{ payment_terms: PaymentTermOption[] }>("/api/v1/catalogs/payment-terms?status=active&limit=200");
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
