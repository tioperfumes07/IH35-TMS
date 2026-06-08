import { apiRequest } from "./client";
import { filterHumanDrivers } from "../lib/driver-pseudo-user";
import type { CreateDriverInput, CustomerType, Driver, DriverOnboardingCreateResponse, MilesBasis, UpdateDriverInput } from "../types/api";

export function listDrivers(params: {
  status?: string;
  search?: string;
  operating_company_id?: string | null;
  include_system?: boolean;
}) {
  const query = new URLSearchParams();
  if (params.status && params.status !== "All") {
    const statusValue = params.status === "Suspended" ? "Inactive" : params.status;
    query.set("status", statusValue);
  }
  if (params.search) query.set("search", params.search);
  if (params.operating_company_id) query.set("operating_company_id", params.operating_company_id);
  if (params.include_system) query.set("include_system", "true");
  const qs = query.toString();
  return apiRequest<{ drivers: Driver[] }>(`/api/v1/mdata/drivers${qs ? `?${qs}` : ""}`).then((payload) => ({
    drivers: params.include_system ? payload.drivers : filterHumanDrivers(payload.drivers),
  }));
}

export function quicksaveEquipmentAssignment(payload: {
  operating_company_id: string;
  equipment_kind: "truck" | "trailer";
  equipment_id: string;
  driver_id: string;
}) {
  return apiRequest<{ ok: boolean; equipment_kind: string; equipment_id: string; driver_id: string }>(
    "/api/v1/assignments/quicksave",
    { method: "POST", body: payload }
  );
}

export type DriverTeamSplitMethod = "50_50" | "60_40" | "70_30" | "mileage_prorated" | "hours_prorated" | "custom";

export type DriverTeam = {
  id: string;
  operating_company_id: string;
  team_name: string;
  primary_driver_id: string;
  secondary_driver_id: string;
  primary_driver_name?: string | null;
  co_driver_name?: string | null;
  split_method: DriverTeamSplitMethod;
  primary_share_pct: number;
  co_share_pct: number;
  is_active: boolean;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
  settlement_history?: Array<Record<string, unknown>>;
};

export function listDriverTeams(operatingCompanyId: string) {
  return apiRequest<{ teams: DriverTeam[] }>(`/api/v1/driver-teams?operating_company_id=${encodeURIComponent(operatingCompanyId)}`);
}

export function getDriverTeam(id: string, operatingCompanyId: string) {
  return apiRequest<{ team: DriverTeam }>(`/api/v1/driver-teams/${id}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`);
}

export function createDriverTeam(body: {
  operating_company_id: string;
  team_name: string;
  primary_driver_id: string;
  co_driver_id: string;
  split_method: DriverTeamSplitMethod;
  primary_share_pct?: number;
  co_share_pct?: number;
  effective_from?: string;
  notes?: string;
}) {
  return apiRequest<{ data: DriverTeam }>("/api/v1/driver-teams", { method: "POST", body });
}

export function updateDriverTeam(
  id: string,
  body: {
    operating_company_id: string;
    split_method: DriverTeamSplitMethod;
    primary_share_pct?: number;
    co_share_pct?: number;
    effective_from: string;
    reactivate?: boolean;
    notes?: string;
  }
) {
  return apiRequest<{ data: DriverTeam }>(`/api/v1/driver-teams/${id}`, { method: "PATCH", body });
}

export function deactivateDriverTeam(id: string, body: { operating_company_id: string; reason: string }) {
  return apiRequest<{ data: DriverTeam }>(`/api/v1/driver-teams/${id}/deactivate`, { method: "POST", body });
}

export function previewTeamSettlementSplit(loadId: string, operatingCompanyId: string) {
  return apiRequest<Record<string, unknown>>(
    `/api/v1/loads/${loadId}/team-settlement-split?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export function getDriver(id: string) {
  return apiRequest<Driver>(`/api/v1/mdata/drivers/${id}`);
}

export function createDriver(body: CreateDriverInput) {
  return apiRequest<DriverOnboardingCreateResponse>("/api/v1/mdata/drivers", { method: "POST", body });
}

export function updateDriver(id: string, body: UpdateDriverInput) {
  return apiRequest<Driver>(`/api/v1/mdata/drivers/${id}`, { method: "PATCH", body });
}

export function sendDriverProfileMessage(
  driverId: string,
  operatingCompanyId: string,
  body: { message: string; channel: "sms" | "email" | "in_app"; urgency?: string }
) {
  return apiRequest<{ id: string; channel: string; urgency: string | null; created_at: string }>(
    `/api/v1/mdata/drivers/${driverId}/messages?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
    { method: "POST", body }
  );
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

export function resendDriverInvite(id: string) {
  return apiRequest<{ sent_to: string; email_id: string }>(`/api/v1/mdata/drivers/${id}/resend-invite`, { method: "POST" });
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

export type TerminationReason = {
  id: string;
  code: string;
  label: string;
  description: string | null;
  severity: "info" | "warning" | "severe";
  is_active: boolean;
  deactivated_at: string | null;
};

export type SafetyEvent = {
  id: string;
  driver_id: string;
  event_type: "termination" | "incident" | "complaint" | "commendation" | "dispute";
  event_date: string;
  severity: "info" | "warning" | "severe";
  summary: string;
  details: string | null;
  termination_reason_id: string | null;
  termination_reason_code?: string | null;
  termination_reason_label?: string | null;
  termination_reason_severity?: "info" | "warning" | "severe" | null;
  related_load_id: string | null;
  document_ids: string[] | null;
  curp_snapshot: string | null;
  cdl_number_snapshot: string | null;
  cdl_state_snapshot: string | null;
  voided_at: string | null;
  voided_by_user_id: string | null;
  voided_by_user_email?: string | null;
  void_reason: string | null;
  created_at: string;
  updated_at: string;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
};

export type ReturningDetectionResult = {
  returning_driver: boolean;
  matched_events: Array<{
    event_id: string;
    event_type: string;
    event_date: string;
    severity: "info" | "warning" | "severe";
    summary: string;
    termination_reason: {
      code: string;
      label: string;
      severity: "info" | "warning" | "severe";
    } | null;
    voided: boolean;
    matched_driver_id: string;
    matched_driver_name: string;
    matched_driver_curp: string | null;
    matched_driver_status: string | null;
  }>;
  severity_summary: {
    severe_count: number;
    warning_count: number;
    info_count: number;
  };
};

export type Customer = {
  id: string;
  name: string;
  customer_code: string | null;
  email: string | null;
  phone: string | null;
  billing_address: string | null;
  billing_state: string | null;
  mc_number: string | null;
  dot_number: string | null;
  tax_id: string | null;
  credit_limit: string | null;
  credit_limit_source: "factor" | "manual" | "rmis_future" | null;
  credit_limit_updated_at: string | null;
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
  layover_charge_per_day: string | null;
  layover_currency: "USD" | "MXN" | "CAD" | null;
  layover_first_night_free: boolean;
  layover_max_days: number | null;
  layover_notes: string | null;
  factoring_eligible: boolean;
  factoring_company_vendor_id: string | null;
  factoring_company_name?: string | null;
  factoring_advance_rate_override: string | null;
  factoring_reserve_pct_override: string | null;
  factoring_recourse_type: "recourse" | "non_recourse" | null;
  factoring_notes: string | null;
  quality_overall_flag: "preferred" | "standard" | "caution" | "avoid";
  quality_payment_score: string | null;
  quality_cancellation_score: string | null;
  quality_disputes_count: number;
  quality_last_evaluated_at: string | null;
  quality_notes: string | null;
  relationship_health_tier?: RelationshipHealthTier | null;
  relationship_overall_health_score?: number | null;
  relationship_score_computed_at?: string | null;
  fmcsa_verified_at: string | null;
  fmcsa_lookup_id: string | null;
  fmcsa_authority_status_at_verification: string | null;
  fmcsa_last_checked_at: string | null;
  fmcsa_check_response: unknown | null;
  created_at: string;
  updated_at: string;
  deactivated_at: string | null;
  created_by_user_id: string;
  updated_by_user_id: string;
};

export type CreateCustomerInput = {
  name: string;
  legal_name?: string;
  dba?: string;
  code?: string;
  customer_code?: string;
  email?: string;
  phone?: string;
  billing_address?: string;
  billing_state?: string;
  mc_number?: string;
  dot_number?: string;
  tax_id?: string;
  credit_limit?: number;
  credit_limit_source?: "factor" | "manual" | "rmis_future" | null;
  credit_limit_updated_at?: string | null;
  payment_terms_id?: string | null;
  operating_company_id?: string;
  customer_type?: CustomerType | "direct";
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
  layover_charge_per_day?: number | null;
  layover_currency?: "USD" | "MXN" | "CAD" | null;
  layover_first_night_free?: boolean;
  layover_max_days?: number | null;
  layover_notes?: string | null;
  factoring_eligible?: boolean;
  factoring_company_vendor_id?: string | null;
  factoring_advance_rate_override?: number | null;
  factoring_reserve_pct_override?: number | null;
  factoring_recourse_type?: "recourse" | "non_recourse" | null;
  factoring_notes?: string | null;
  quality_overall_flag?: "preferred" | "standard" | "caution" | "avoid";
  quality_notes?: string;
};

export type RelationshipHealthTier = "thriving" | "healthy" | "watch" | "at_risk";

export type CustomerRelationshipScore = {
  customer_uuid: string;
  operating_company_id: string;
  computed_at: string;
  overall_health_score: number;
  health_tier: RelationshipHealthTier;
  engagement_subscore: number | null;
  payment_behavior_subscore: number | null;
  service_quality_subscore: number | null;
  margin_trend_subscore: number | null;
  complaint_subscore: number | null;
};

export type AtRiskCustomerRelationshipScore = {
  customer_uuid: string;
  customer_name: string;
  customer_code: string | null;
  overall_health_score: number;
  health_tier: RelationshipHealthTier;
  computed_at: string;
};

export type UpdateCustomerInput = Partial<{
  name: string;
  customer_code: string | null;
  email: string | null;
  phone: string | null;
  billing_address: string | null;
  billing_state: string | null;
  mc_number: string | null;
  dot_number: string | null;
  tax_id: string | null;
  credit_limit: number | null;
  credit_limit_source: "factor" | "manual" | "rmis_future" | null;
  credit_limit_updated_at: string | null;
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
  layover_charge_per_day: number | null;
  layover_currency: "USD" | "MXN" | "CAD" | null;
  layover_first_night_free: boolean;
  layover_max_days: number | null;
  layover_notes: string | null;
  factoring_eligible: boolean;
  factoring_company_vendor_id: string | null;
  factoring_advance_rate_override: number | null;
  factoring_reserve_pct_override: number | null;
  factoring_recourse_type: "recourse" | "non_recourse" | null;
  factoring_notes: string | null;
  quality_overall_flag: "preferred" | "standard" | "caution" | "avoid";
  quality_notes: string | null;
  deactivated_at: string | null;
}>;

export type CustomerDetailFull = Customer & { contacts: CustomerContact[] };

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

export type CustomerBillingSummary = {
  ar_email: string | null;
  credit_terms_days: number | null;
  factoring_eligible: boolean;
  factoring_company_vendor_id: string | null;
  factoring_recourse_type: "recourse" | "non_recourse" | null;
  factoring_advance_rate_override: string | null;
  factoring_reserve_pct_override: string | null;
  factoring_notes: string | null;
  default_detention_rate: string | null;
  default_free_time_hours: string | null;
  layover_config: {
    layover_charge_per_day: string | null;
    layover_currency: "USD" | "MXN" | "CAD" | null;
    layover_first_night_free: boolean;
    layover_max_days: number | null;
    layover_notes: string | null;
    free_time_pickup_minutes: number | null;
    free_time_delivery_minutes: number | null;
  };
  last_payment_at: string | null;
  outstanding_balance_cents: number | null;
  aging_buckets: {
    current: number;
    bucket_1_30: number;
    bucket_31_60: number;
    bucket_61_90: number;
    bucket_91_plus: number;
    total_open: number;
    open_invoice_count: number;
  };
  status?: "real" | "partial";
  partial_message?: string | null;
};

export type CustomerLane = {
  id: string;
  operating_company_id: string;
  customer_id: string;
  lane_label: string;
  origin_city: string;
  origin_state: string;
  destination_city: string;
  destination_state: string;
  typical_miles: number | null;
  base_rate_cents: number;
  fsc_per_mile_cents: number | null;
  accessorials: Array<{ label: string; amount_cents: number }>;
  notes: string | null;
  deactivated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerQualityEventReason = {
  id: string;
  code: string;
  label: string;
  description: string | null;
  event_type: CustomerQualityEvent["event_type"];
  severity: CustomerQualityEvent["severity"];
  is_active: boolean;
  deactivated_at: string | null;
};

export type CustomerQualityEvent = {
  id: string;
  customer_id: string;
  event_type:
    | "late_payment"
    | "non_payment"
    | "lumper_dispute"
    | "detention_dispute"
    | "tonu_dispute"
    | "load_cancelled"
    | "rate_dispute"
    | "damage_claim"
    | "commendation"
    | "other";
  event_date: string;
  severity: "info" | "warning" | "severe";
  summary: string;
  details: string | null;
  reason_id: string | null;
  reason_code?: string | null;
  reason_label?: string | null;
  dollar_impact_amount: string | null;
  dollar_currency: string;
  days_late: number | null;
  related_load_id: string | null;
  related_invoice_id: string | null;
  document_ids: string[] | null;
  voided_at: string | null;
  voided_by_user_id: string | null;
  voided_by_user_email?: string | null;
  void_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type PaymentTermOption = {
  id: string;
  terms_name: string;
  days_until_due: number;
};

export type VendorOption = {
  id: string;
  name: string;
  vendor_type: string;
  vendor_category?: string | null;
  vendor_category_locked_at?: string | null;
  vendor_code?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  tax_id?: string | null;
  notes: string | null;
  operating_company_id: string;
  created_at?: string;
  updated_at?: string;
  created_by_user_id?: string;
  updated_by_user_id?: string;
  deactivated_at: string | null;
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

export function listTerminationReasons(includeInactive = false) {
  const query = includeInactive ? "?include_inactive=true" : "";
  return apiRequest<{ reasons: TerminationReason[] }>(`/api/v1/catalogs/driver-termination-reasons${query}`);
}

export function listSafetyEvents(driverId: string, includeVoided = false) {
  const query = includeVoided ? "?include_voided=true" : "";
  return apiRequest<{ events: SafetyEvent[] }>(`/api/v1/mdata/drivers/${driverId}/safety-events${query}`);
}

export function createSafetyEvent(
  driverId: string,
  body: {
    event_type: SafetyEvent["event_type"];
    event_date: string;
    severity: SafetyEvent["severity"];
    summary: string;
    details?: string;
    termination_reason_id?: string;
    related_load_id?: string;
    document_ids?: string[];
  }
) {
  return apiRequest<{ event: SafetyEvent }>(`/api/v1/mdata/drivers/${driverId}/safety-events`, {
    method: "POST",
    body,
  });
}

export function updateSafetyEvent(
  driverId: string,
  eventId: string,
  body: {
    details?: string | null;
    document_ids?: string[] | null;
  }
) {
  return apiRequest<{ event: SafetyEvent }>(`/api/v1/mdata/drivers/${driverId}/safety-events/${eventId}`, {
    method: "PATCH",
    body,
  });
}

export function voidSafetyEvent(driverId: string, eventId: string, voidReason: string) {
  return apiRequest<{ event: SafetyEvent }>(`/api/v1/mdata/drivers/${driverId}/safety-events/${eventId}/void`, {
    method: "PATCH",
    body: { void_reason: voidReason },
  });
}

export function checkReturningDriver(curp?: string, cdlNumber?: string, cdlState?: string) {
  return apiRequest<ReturningDetectionResult>("/api/v1/mdata/drivers/check-returning", {
    method: "POST",
    body: {
      curp: curp || undefined,
      cdl_number: cdlNumber || undefined,
      cdl_state: cdlState || undefined,
    },
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

export function getCustomerRelationshipScore(customerUuid: string, operatingCompanyId?: string | null) {
  const query = new URLSearchParams();
  if (operatingCompanyId) query.set("operating_company_id", operatingCompanyId);
  const qs = query.toString();
  return apiRequest<CustomerRelationshipScore>(
    `/api/v1/customers/${customerUuid}/relationship-score${qs ? `?${qs}` : ""}`
  );
}

export function listAtRiskCustomerRelationshipScores(params: {
  operating_company_id?: string | null;
  limit?: number;
} = {}) {
  const query = new URLSearchParams();
  if (params.operating_company_id) query.set("operating_company_id", params.operating_company_id);
  if (params.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return apiRequest<{ operating_company_id: string; count: number; customers: AtRiskCustomerRelationshipScore[] }>(
    `/api/v1/customers/relationship-scores/at-risk${qs ? `?${qs}` : ""}`
  );
}

export function createCustomer(body: CreateCustomerInput) {
  return apiRequest<Customer>("/api/v1/mdata/customers", { method: "POST", body });
}

export function updateCustomer(id: string, body: UpdateCustomerInput) {
  return apiRequest<Customer>(`/api/v1/mdata/customers/${id}`, { method: "PATCH", body });
}

export function getCustomerDetail(id: string, operatingCompanyId?: string | null) {
  const query = operatingCompanyId ? `?operating_company_id=${encodeURIComponent(operatingCompanyId)}` : "";
  return apiRequest<{ customer: CustomerDetailFull }>(`/api/v1/mdata/customers/${id}/detail${query}`);
}

export type CustomerFinancialSummary = {
  revenue_by_month: Array<{ month: string; total_cents: number }>;
  ar_aging_buckets: Array<{ bucket: string; open_cents: number }>;
  recent_loads: Array<{
    id: string;
    load_number: string | null;
    status: string | null;
    rate_total_cents: number | null;
    created_at: string;
  }>;
  documents: Array<Record<string, unknown>>;
};

export function getCustomerFinancialSummary(customerId: string, operatingCompanyId: string) {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<CustomerFinancialSummary>(`/api/v1/mdata/customers/${customerId}/financial-summary?${q}`);
}

export function verifyCustomerFmcsa(id: string) {
  return apiRequest<{ customer: Customer }>(`/api/v1/mdata/customers/${id}/verify-fmcsa`, { method: "POST" });
}

export function listCustomerQualityEventReasons(
  eventType?: CustomerQualityEvent["event_type"],
  includeInactive = false
) {
  const query = new URLSearchParams();
  if (eventType) query.set("event_type", eventType);
  if (includeInactive) query.set("include_inactive", "true");
  const qs = query.toString();
  return apiRequest<{ reasons: CustomerQualityEventReason[] }>(
    `/api/v1/catalogs/customer-quality-event-reasons${qs ? `?${qs}` : ""}`
  );
}

export function listCustomerQualityEvents(customerId: string, includeVoided = false) {
  const query = includeVoided ? "?include_voided=true" : "";
  return apiRequest<{ events: CustomerQualityEvent[] }>(`/api/v1/mdata/customers/${customerId}/quality-events${query}`);
}

export function createCustomerQualityEvent(
  customerId: string,
  body: {
    event_type: CustomerQualityEvent["event_type"];
    event_date: string;
    severity: CustomerQualityEvent["severity"];
    summary: string;
    details?: string;
    reason_id?: string;
    dollar_impact_amount?: number;
    days_late?: number;
    related_load_id?: string;
    related_invoice_id?: string;
    document_ids?: string[];
  }
) {
  return apiRequest<{ event: CustomerQualityEvent }>(`/api/v1/mdata/customers/${customerId}/quality-events`, { method: "POST", body });
}

export function voidCustomerQualityEvent(customerId: string, eventId: string, voidReason: string) {
  return apiRequest<{ event: CustomerQualityEvent }>(`/api/v1/mdata/customers/${customerId}/quality-events/${eventId}/void`, {
    method: "PATCH",
    body: { void_reason: voidReason },
  });
}

export function updateCustomerQualityEvent(
  customerId: string,
  eventId: string,
  body: { details?: string | null; document_ids?: string[] | null; dollar_impact_amount?: number | null }
) {
  return apiRequest<{ event: CustomerQualityEvent }>(`/api/v1/mdata/customers/${customerId}/quality-events/${eventId}`, {
    method: "PATCH",
    body,
  });
}

export function listCustomerContacts(customerId: string, includeInactive = false, operatingCompanyId?: string | null) {
  const query = new URLSearchParams();
  if (includeInactive) query.set("include_inactive", "true");
  if (operatingCompanyId) query.set("operating_company_id", operatingCompanyId);
  const qs = query.toString();
  return apiRequest<{ contacts: CustomerContact[] }>(`/api/v1/mdata/customers/${customerId}/contacts${qs ? `?${qs}` : ""}`);
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
  },
  operatingCompanyId?: string | null
) {
  const query = operatingCompanyId ? `?operating_company_id=${encodeURIComponent(operatingCompanyId)}` : "";
  return apiRequest<{ contact: CustomerContact }>(`/api/v1/mdata/customers/${customerId}/contacts${query}`, { method: "POST", body: payload });
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
  }>,
  operatingCompanyId?: string | null
) {
  const query = operatingCompanyId ? `?operating_company_id=${encodeURIComponent(operatingCompanyId)}` : "";
  return apiRequest<{ contact: CustomerContact }>(`/api/v1/mdata/customers/${customerId}/contacts/${contactId}${query}`, {
    method: "PATCH",
    body: payload,
  });
}

export function deactivateCustomerContact(customerId: string, contactId: string, operatingCompanyId?: string | null) {
  const query = operatingCompanyId ? `?operating_company_id=${encodeURIComponent(operatingCompanyId)}` : "";
  return apiRequest<{ ok: true }>(`/api/v1/mdata/customers/${customerId}/contacts/${contactId}${query}`, {
    method: "DELETE",
  });
}

export function reactivateCustomerContact(customerId: string, contactId: string, operatingCompanyId?: string | null) {
  const query = operatingCompanyId ? `?operating_company_id=${encodeURIComponent(operatingCompanyId)}` : "";
  return apiRequest<{ ok: true }>(`/api/v1/mdata/customers/${customerId}/contacts/${contactId}/reactivate${query}`, {
    method: "POST",
  });
}

export function getCustomerBillingSummary(customerId: string, operatingCompanyId: string) {
  const query = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<CustomerBillingSummary>(`/api/v1/mdata/customers/${customerId}/billing-summary?${query.toString()}`);
}

export function listCustomerLanes(customerId: string, operatingCompanyId: string, includeInactive = false) {
  const query = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (includeInactive) query.set("include_inactive", "true");
  return apiRequest<{ lanes: CustomerLane[] }>(`/api/v1/mdata/customers/${customerId}/lanes?${query.toString()}`);
}

export function createCustomerLane(
  customerId: string,
  operatingCompanyId: string,
  payload: {
    lane_label: string;
    origin_city: string;
    origin_state: string;
    destination_city: string;
    destination_state: string;
    typical_miles?: number;
    base_rate_cents: number;
    fsc_per_mile_cents?: number;
    accessorials?: Array<{ label: string; amount_cents: number }>;
    notes?: string;
  }
) {
  const query = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<{ lane: CustomerLane }>(`/api/v1/mdata/customers/${customerId}/lanes?${query.toString()}`, {
    method: "POST",
    body: payload,
  });
}

export function updateCustomerLane(
  customerId: string,
  laneId: string,
  operatingCompanyId: string,
  payload: Partial<{
    lane_label: string;
    origin_city: string;
    origin_state: string;
    destination_city: string;
    destination_state: string;
    typical_miles: number | null;
    base_rate_cents: number;
    fsc_per_mile_cents: number | null;
    accessorials: Array<{ label: string; amount_cents: number }>;
    notes: string | null;
  }>
) {
  const query = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<{ lane: CustomerLane }>(`/api/v1/mdata/customers/${customerId}/lanes/${laneId}?${query.toString()}`, {
    method: "PATCH",
    body: payload,
  });
}

export function deactivateCustomerLane(customerId: string, laneId: string, operatingCompanyId: string) {
  const query = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<void>(`/api/v1/mdata/customers/${customerId}/lanes/${laneId}?${query.toString()}`, {
    method: "DELETE",
  });
}

export function listPaymentTermOptions() {
  return apiRequest<{ payment_terms: PaymentTermOption[] }>("/api/v1/catalogs/payment-terms?status=active&limit=200");
}

export function listVendors(params: CompanyScopedListParams = {}) {
  const query = new URLSearchParams();
  appendCompanyScopedQuery(query, params);
  const qs = query.toString();
  return apiRequest<{ vendors: VendorOption[] }>(`/api/v1/mdata/vendors${qs ? `?${qs}` : ""}`);
}

export function getVendor(id: string, operatingCompanyId?: string | null) {
  const query = operatingCompanyId ? `?operating_company_id=${encodeURIComponent(operatingCompanyId)}` : "";
  return apiRequest<VendorOption>(`/api/v1/mdata/vendors/${id}${query}`);
}

export type CreateVendorInput = {
  name: string;
  vendor_type: "Fuel" | "Repair" | "Tires" | "Towing" | "Insurance" | "Permit" | "Toll" | "Other";
  vendor_code?: string;
  phone?: string;
  email?: string;
  operating_company_id?: string;
  address?: string;
  tax_id?: string;
  notes?: string;
};

export function createVendor(body: CreateVendorInput) {
  return apiRequest<VendorOption>("/api/v1/mdata/vendors", { method: "POST", body });
}

export type UpdateVendorInput = Partial<{
  name: string;
  vendor_code: string | null;
  vendor_type: "Fuel" | "Repair" | "Tires" | "Towing" | "Insurance" | "Permit" | "Toll" | "Other";
  phone: string | null;
  email: string | null;
  operating_company_id: string;
  address: string | null;
  tax_id: string | null;
  notes: string | null;
  deactivated_at: string | null;
}>;

export function updateVendor(id: string, body: UpdateVendorInput) {
  return apiRequest<VendorOption>(`/api/v1/mdata/vendors/${id}`, { method: "PATCH", body });
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

export type QboVendorCandidate = {
  qbo_vendor_id: string;
  display_name: string;
  company_name: string | null;
  active: boolean;
  score?: number;
};

export type DriverQboMappingStatus = {
  id: string;
  first_name: string;
  last_name: string;
  qbo_vendor_id: string | null;
  qbo_vendor_linked_at: string | null;
  linked: boolean;
};

export function listQboVendors(operatingCompanyId: string, query = "", limit = 50) {
  const params = new URLSearchParams({
    operating_company_id: operatingCompanyId,
    query,
    limit: String(limit),
  });
  return apiRequest<{ rows: QboVendorCandidate[] }>(`/api/v1/integrations/qbo/vendors?${params.toString()}`);
}

export function listQboVendorSuggestions(
  operatingCompanyId: string,
  entityType: "driver" | "unit" | "equipment" | "asset",
  entityId: string
) {
  const params = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<{ rows: QboVendorCandidate[] }>(
    `/api/v1/integrations/qbo/vendor-suggestions/${entityType}/${entityId}?${params.toString()}`
  );
}

export function linkDriverQboVendor(
  driverId: string,
  body: { operating_company_id: string; qbo_vendor_id: string; reason: string; force?: boolean }
) {
  return apiRequest<{ ok: true; idempotent: boolean }>(`/api/v1/master-data/drivers/${driverId}/link-qbo-vendor`, {
    method: "POST",
    body,
  });
}

export function linkUnitQboClass(
  unitId: string,
  body: { operating_company_id: string; qbo_class_id: string; reason: string; force?: boolean }
) {
  return apiRequest<{ ok: true; idempotent: boolean }>(`/api/v1/master-data/units/${unitId}/link-qbo-class`, {
    method: "POST",
    body,
  });
}

export function linkTrailerQboClass(
  trailerId: string,
  body: { operating_company_id: string; qbo_class_id: string; reason: string; force?: boolean }
) {
  return apiRequest<{ ok: true; idempotent: boolean }>(`/api/v1/master-data/trailers/${trailerId}/link-qbo-class`, {
    method: "POST",
    body,
  });
}

export function listDriverQboMappingStatus(operatingCompanyId: string) {
  const params = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return apiRequest<{ rows: DriverQboMappingStatus[] }>(`/api/v1/master-data/drivers/qbo-mapping-status?${params.toString()}`);
}

export function listQboVendorLinkageHistory(
  operatingCompanyId: string,
  entityType?: "driver" | "unit" | "equipment" | "asset",
  entityId?: string
) {
  const params = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (entityType) params.set("entity_type", entityType);
  if (entityId) params.set("entity_id", entityId);
  return apiRequest<{ rows: Array<Record<string, unknown>> }>(`/api/v1/integrations/qbo/vendor-linkage-history?${params.toString()}`);
}

export function unlinkQboVendor(
  operatingCompanyId: string,
  entityType: "driver" | "unit" | "equipment" | "asset",
  entityId: string,
  reason: string
) {
  return apiRequest<{ ok: true; idempotent: boolean }>(`/api/v1/integrations/qbo/vendor-link/${entityType}/${entityId}`, {
    method: "DELETE",
    body: {
      operating_company_id: operatingCompanyId,
      reason,
    },
  });
}

export function linkQboVendor(
  body: {
    operating_company_id: string;
    entity_type: "driver" | "unit" | "equipment" | "asset";
    entity_id: string;
    qbo_vendor_id: string;
    reason: string;
    force?: boolean;
  }
) {
  return apiRequest<{ ok: true; idempotent: boolean }>("/api/v1/integrations/qbo/vendor-link", {
    method: "POST",
    body,
  });
}

export type MdataUnit = Record<string, unknown> & {
  id: string;
  unit_number?: string;
  qbo_vendor_id?: string | null;
  qbo_class_id?: string | null;
};

export function getUnit(id: string) {
  return apiRequest<MdataUnit>(`/api/v1/mdata/units/${id}`);
}

export function patchUnit(id: string, body: Record<string, unknown>) {
  return apiRequest<MdataUnit>(`/api/v1/mdata/units/${id}`, { method: "PATCH", body });
}
