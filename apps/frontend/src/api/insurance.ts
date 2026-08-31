import { apiRequest } from "./client";

export type InsuranceCoverageType =
  | "auto_liability"
  | "physical_damage"
  | "cargo"
  | "general_liability"
  | "workers_comp"
  | "trailer_interchange"
  | "bobtail"
  | "non_trucking_liability"
  | "umbrella"
  | "excess_liability"
  | "occupational_accident"
  | "garage_keepers"
  | "reefer_breakdown"
  | "pollution"
  | "cyber_liability";

export type InsurancePolicyStatus = "active" | "expired" | "cancelled" | "pending";
// INSURANCE REQUEST FEATURE (owner-authorized 2026-08-31): the 5 original values are untouched (no
// existing row/consumer is rewritten); the 4 new values are the owner's lifecycle for the general
// request pipeline (requested -> sent -> acknowledged -> issued/declined). 'sent' is shared
// verbatim between both vocabularies.
export type CoiRequestStatus =
  | "pending"
  | "sent"
  | "received"
  | "expired"
  | "dismissed"
  | "requested"
  | "acknowledged"
  | "issued"
  | "declined";
// The 3 shapes ONE pipeline covers (owner: "no second table"). unit_add is declared now so a
// future unit-add slice needs no further type change, only a route.
export type InsuranceRequestType = "customer_coi" | "driver_add" | "unit_add";
export type PaymentScheduleStatus = "scheduled" | "reminded" | "paid" | "overdue" | "late_fee_applied";
export type InsuranceClaimStatus = "open" | "investigating" | "approved" | "denied" | "paid" | "closed";
export type InsuranceLawsuitStatus = "filed" | "active" | "settled" | "dismissed" | "judgment";

/**
 * WIZARD-CLAIM-ECONOMICS-DEPTH slice 2 (202607730000, HOLD-FOR-JORGE — not yet applied on prod).
 * Mirrors apps/backend/src/insurance/claim.shared.ts INSURANCE_CLAIM_FAULT_VALUES.
 */
export type InsuranceClaimFault = "undetermined" | "company" | "third_party" | "shared";

/**
 * Owner lock #1 (2026-07-22, master plan §0.1 Example A2): ALWAYS ASK — 'ask' is the permanent neutral
 * "not decided yet" state. The UI must default to 'ask' and never silently auto-advance it.
 */
export const INSURANCE_CLAIM_RECOVERY_RAIL_VALUES = ["escrow", "settlement", "split", "ask"] as const;
/**
 * Derived from the array above so the type and the runtime values can never disagree. The array
 * exists because a picker needs values, not just a type — before it, any surface offering these
 * options had to re-type the four words, which is how a second dialect starts.
 */
export type InsuranceClaimRecoveryRail = (typeof INSURANCE_CLAIM_RECOVERY_RAIL_VALUES)[number];

/** Owner lock #2 (2026-07-22, Choice Z): ALWAYS ASK — no dollar threshold, ever. */
export type InsuranceClaimRepairBooksTreatment = "expense" | "capitalize" | "ask";

export type InsurancePolicy = {
  id: string;
  vendor_id: string;
  insurer_name: string;
  policy_number: string;
  coverage_type: InsuranceCoverageType;
  coverage_type_id: string | null;
  /** Canonical human label resolved from the same-company insurance.type_catalog row. */
  coverage_type_name?: string | null;
  effective_date: string;
  expiry_date: string;
  total_premium_cents: number;
  down_payment_cents: number;
  installment_count: number;
  due_day: number | null;
  pay_day: number | null;
  late_fee_pct: string;
  insurer_email: string | null;
  agent_contact: string | null;
  status: InsurancePolicyStatus;
  created_at: string;
  updated_at: string;
};

export type InsurancePolicyUnit = {
  id: string;
  policy_id: string;
  asset_id: string;
  /** Resolved mdata.units.id for fleet drill-through (from assets registry). */
  unit_id?: string | null;
  unit_number?: string | null;
  insured_value_cents: number;
  created_at: string;
  updated_at: string;
};

export type InsurancePolicyDetail = InsurancePolicy & {
  units: InsurancePolicyUnit[];
};

export type CreateInsurancePolicyPayload = {
  operating_company_id: string;
  vendor_id: string;
  insurer_name: string;
  policy_number: string;
  coverage_type: InsuranceCoverageType;
  effective_date: string;
  expiry_date: string;
  total_premium_cents?: number;
  down_payment_cents?: number;
  installment_count?: number;
  due_day?: number | null;
  pay_day?: number | null;
  late_fee_pct?: number;
  insurer_email?: string | null;
  agent_contact?: string | null;
  status?: InsurancePolicyStatus;
};

export type UpdateInsurancePolicyPayload = Partial<Omit<CreateInsurancePolicyPayload, "operating_company_id">>;

export type InsuranceTypeCatalogEntry = {
  id: string;
  code: InsuranceCoverageType;
  name: string;
  description: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type CreateInsuranceTypeCatalogPayload = {
  operating_company_id: string;
  code: InsuranceCoverageType;
  name: string;
  description?: string | null;
  active?: boolean;
  sort_order?: number;
};

export type UpdateInsuranceTypeCatalogPayload = {
  code?: InsuranceCoverageType;
  name?: string;
  description?: string | null;
  active?: boolean;
  sort_order?: number;
};

export type InsuranceAssetCoverage = {
  asset: {
    id: string;
    unit_code?: string | null;
    asset_type?: string | null;
    status?: string | null;
  };
  coverages: Array<{
    policy_id: string;
    insurer_name: string;
    policy_number: string;
    coverage_type: InsuranceCoverageType;
    effective_date: string;
    expiry_date: string;
    status: InsurancePolicyStatus;
    insured_value_cents: number;
  }>;
  covered_types: InsuranceCoverageType[];
  gap_types: InsuranceCoverageType[];
};

export type InsuranceCoiRequest = {
  id: string;
  tenant_id: string;
  request_type: InsuranceRequestType;
  customer_id: string | null;
  driver_id: string | null;
  unit_id: string | null;
  policy_id: string | null;
  requested_at: string;
  requested_by: string | null;
  requested_by_name?: string | null;
  policy_number?: string | null;
  customer_name?: string | null;
  driver_name?: string | null;
  unit_number?: string | null;
  status: CoiRequestStatus;
  notes: string | null;
  document_url: string | null;
  expires_at: string | null;
  responded_at: string | null;
  sent_at: string | null;
  acknowledged_at: string | null;
  broker_email: string;
  email_queue_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateCoiRequestPayload = {
  operating_company_id: string;
  request_type?: InsuranceRequestType;
  customer_id?: string | null;
  driver_id?: string | null;
  unit_id?: string | null;
  policy_id?: string | null;
  notes?: string | null;
  expires_at?: string | null;
};

export type UpdateCoiRequestPayload = {
  status?: CoiRequestStatus;
  notes?: string | null;
  document_url?: string | null;
  expires_at?: string | null;
  responded_at?: string | null;
  acknowledged_at?: string | null;
  policy_id?: string | null;
  reason?: string | null;
};

export type DriverScheduleStatus = {
  on_schedule: boolean;
  latest_request: { id: string; status: CoiRequestStatus; acknowledged_at: string | null; requested_at: string } | null;
};

export type InsurancePaymentSchedule = {
  id: string;
  tenant_id: string;
  policy_id: string;
  due_date: string;
  amount_cents: number;
  status: PaymentScheduleStatus;
  reminded_at: string | null;
  paid_at: string | null;
  late_fee_cents: number;
  created_at: string;
  updated_at: string;
};

export type CreateInsurancePaymentSchedulePayload = {
  operating_company_id: string;
  policy_id: string;
  due_date: string;
  amount_cents: number;
  status?: PaymentScheduleStatus;
};

export type InsuranceClaim = {
  id: string;
  tenant_id: string;
  claim_number: string;
  policy_id: string;
  asset_id: string | null;
  /** Resolved from mdata.assets.unit_id when asset is linked (asset ≠ unit). */
  unit_id?: string | null;
  accident_date: string;
  reported_date: string;
  status: InsuranceClaimStatus;
  amount_claimed_cents: number;
  amount_paid_cents: number;
  adjuster_name: string | null;
  adjuster_email: string | null;
  notes: string | null;
  created_at: string;
  accident_report_id?: string | null;
  load_id?: string | null;
  driver_id?: string | null;
  /** WIZARD-CLAIM-ECONOMICS-DEPTH slice 2 (202607730000, HOLD — not yet on prod). */
  fault?: InsuranceClaimFault;
  driver_responsible?: boolean | null;
  trailer_id?: string | null;
  /** Resolved from mdata.equipment.equipment_number (claim.routes.ts CLAIM_FROM join). */
  trailer_display_id?: string | null;
  // CLS-UUID-LABEL: resolved by LEFT JOIN in insurance/claim.routes.ts so the UI can label a link with
  // a name instead of a sliced uuid. Optional because a claim may legitimately have no driver, unit,
  // load or policy attached — the UI falls back to EntityLink's own handling rather than a uuid.
  driver_display_name?: string | null;
  unit_display_id?: string | null;
  load_display_id?: string | null;
  policy_display_id?: string | null;
  deductible_cents?: number;
  recovery_rail?: InsuranceClaimRecoveryRail;
  repair_books_treatment?: InsuranceClaimRepairBooksTreatment;
};

export type InsuranceClaimGraph = {
  claim: InsuranceClaim;
  reverse: {
    accidents: Array<{ id: string; insurance_claim_id: string | null; driver_id: string | null; unit_id: string | null; accident_at: string | null }>;
    lawsuits: Array<{ id: string; case_number: string; claim_id: string | null; status: string; filed_date: string | null }>;
    matters: Array<{ id: string; matter_number: string; insurance_claim_id: string | null; status: string; type: string }>;
    incidents: Array<{ id: string; auto_created_claim_id: string | null; incident_type: string | null; incident_at: string | null }>;
    damage_continuity_chains: Array<{ id: string; insurance_claim_id: string | null; final_resolution_status: string | null }>;
    /** ACCT-F04 reverse density — populated when insurance_claim_id columns exist (prod). */
    bills?: Array<{ id: string; bill_number: string | null; amount_cents?: string; status: string | null; bill_date?: string | null }>;
    expenses?: Array<{ id: string; total_amount_cents?: string; status: string | null; transaction_date?: string | null }>;
    work_orders?: Array<{ id: string; display_id: string | null; status: string | null }>;
  };
  gaps: {
    expense: string | null;
    work_order: string | null;
    bill?: string | null;
    settlement_deduction: string;
  };
};

export type CreateInsuranceClaimPayload = {
  operating_company_id: string;
  claim_number: string;
  policy_id: string;
  asset_id?: string | null;
  accident_date: string;
  reported_date: string;
  status?: InsuranceClaimStatus;
  amount_claimed_cents?: number;
  amount_paid_cents?: number;
  adjuster_name?: string | null;
  adjuster_email?: string | null;
  notes?: string | null;
  accident_report_id?: string | null;
  load_id?: string | null;
  driver_id?: string | null;
  /** WIZARD-CLAIM-ECONOMICS-DEPTH slice 2 (202607730000, HOLD — not yet on prod). Pure capture, no GL. */
  fault?: InsuranceClaimFault;
  driver_responsible?: boolean | null;
  trailer_id?: string | null;
  deductible_cents?: number;
  /** Owner lock #1: caller must send an explicit value; 'ask' is the safe default, never auto-advanced. */
  recovery_rail?: InsuranceClaimRecoveryRail;
  /** Owner lock #2 (Choice Z): caller must send an explicit value; no $ threshold anywhere. */
  repair_books_treatment?: InsuranceClaimRepairBooksTreatment;
};

export type UpdateInsuranceClaimPayload = {
  claim_number?: string;
  policy_id?: string;
  asset_id?: string | null;
  accident_date?: string;
  reported_date?: string;
  status?: InsuranceClaimStatus;
  amount_claimed_cents?: number;
  amount_paid_cents?: number;
  adjuster_name?: string | null;
  adjuster_email?: string | null;
  notes?: string | null;
  accident_report_id?: string | null;
  load_id?: string | null;
  driver_id?: string | null;
  fault?: InsuranceClaimFault;
  driver_responsible?: boolean | null;
  trailer_id?: string | null;
  deductible_cents?: number;
  recovery_rail?: InsuranceClaimRecoveryRail;
  repair_books_treatment?: InsuranceClaimRepairBooksTreatment;
};

export type InsuranceLawsuit = {
  id: string;
  tenant_id: string;
  case_number: string;
  plaintiff: string;
  defendant: string;
  court_name: string;
  filed_date: string;
  status: InsuranceLawsuitStatus;
  claim_id: string | null;
  claim_number: string | null;
  /** Resolved through lawsuit.claim_id -> insurance.claim.driver_id. */
  driver_id: string | null;
  driver_name: string | null;
  /** Resolved through lawsuit.claim_id -> claim.asset_id -> mdata.assets.unit_id. */
  unit_id: string | null;
  unit_number: string | null;
  demand_cents: number;
  settlement_cents: number;
  attorney_name: string | null;
  attorney_email: string | null;
  notes: string | null;
  created_at: string;
};

export type CreateInsuranceLawsuitPayload = {
  operating_company_id: string;
  case_number: string;
  plaintiff: string;
  defendant: string;
  court_name: string;
  filed_date: string;
  status?: InsuranceLawsuitStatus;
  claim_id?: string | null;
  demand_cents?: number;
  settlement_cents?: number;
  attorney_name?: string | null;
  attorney_email?: string | null;
  notes?: string | null;
};

export type UpdateInsuranceLawsuitPayload = {
  case_number?: string;
  plaintiff?: string;
  defendant?: string;
  court_name?: string;
  filed_date?: string;
  status?: InsuranceLawsuitStatus;
  claim_id?: string | null;
  demand_cents?: number;
  settlement_cents?: number;
  attorney_name?: string | null;
  attorney_email?: string | null;
  notes?: string | null;
};

function toInsuranceQuery(params: Record<string, string | number | boolean | undefined | null>) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value).length > 0) qs.set(key, String(value));
  }
  return qs.toString();
}

export const insurancePoliciesApi = {
  list(params: {
    operating_company_id: string;
    coverage_type?: InsuranceCoverageType;
    status?: InsurancePolicyStatus;
    vendor_id?: string;
  }) {
    return apiRequest<{ policies: InsurancePolicy[] }>(`/api/v1/insurance/policies?${toInsuranceQuery(params)}`);
  },
  get(id: string, operatingCompanyId: string) {
    return apiRequest<InsurancePolicyDetail>(
      `/api/v1/insurance/policies/${id}?${toInsuranceQuery({ operating_company_id: operatingCompanyId })}`
    );
  },
  create(payload: CreateInsurancePolicyPayload) {
    return apiRequest<InsurancePolicy>("/api/v1/insurance/policies", {
      method: "POST",
      body: payload,
    });
  },
  update(id: string, operatingCompanyId: string, payload: UpdateInsurancePolicyPayload) {
    return apiRequest<InsurancePolicy>(
      `/api/v1/insurance/policies/${id}?${toInsuranceQuery({ operating_company_id: operatingCompanyId })}`,
      {
        method: "PATCH",
        body: payload,
      }
    );
  },
};

export const insuranceTypesApi = {
  list(params: { operating_company_id: string; include_inactive?: boolean }) {
    return apiRequest<{ types: InsuranceTypeCatalogEntry[] }>(`/api/v1/insurance/type-catalog?${toInsuranceQuery(params)}`);
  },
  create(payload: CreateInsuranceTypeCatalogPayload) {
    return apiRequest<InsuranceTypeCatalogEntry>("/api/v1/insurance/type-catalog", {
      method: "POST",
      body: payload,
    });
  },
  update(id: string, operatingCompanyId: string, payload: UpdateInsuranceTypeCatalogPayload) {
    return apiRequest<InsuranceTypeCatalogEntry>(
      `/api/v1/insurance/type-catalog/${id}?${toInsuranceQuery({ operating_company_id: operatingCompanyId })}`,
      {
        method: "PATCH",
        body: payload,
      }
    );
  },
  deactivate(id: string, operatingCompanyId: string) {
    return apiRequest<void>(`/api/v1/insurance/type-catalog/${id}?${toInsuranceQuery({ operating_company_id: operatingCompanyId })}`, {
      method: "DELETE",
    });
  },
};

export const insuranceCoverageGapApi = {
  getAssetCoverage(assetId: string, operatingCompanyId: string) {
    return apiRequest<InsuranceAssetCoverage>(
      `/api/v1/assets/${assetId}/coverage?${toInsuranceQuery({ operating_company_id: operatingCompanyId })}`
    );
  },
};

export const insuranceCoiApi = {
  list(params: {
    operating_company_id: string;
    customer_id?: string;
    driver_id?: string;
    unit_id?: string;
    policy_id?: string;
    status?: CoiRequestStatus;
    request_type?: InsuranceRequestType;
  }) {
    return apiRequest<{ requests: InsuranceCoiRequest[] }>(`/api/v1/insurance/coi-requests?${toInsuranceQuery(params)}`);
  },
  create(payload: CreateCoiRequestPayload) {
    return apiRequest<InsuranceCoiRequest>("/api/v1/insurance/coi-requests", {
      method: "POST",
      body: payload,
    });
  },
  update(id: string, operatingCompanyId: string, payload: UpdateCoiRequestPayload) {
    return apiRequest<InsuranceCoiRequest>(
      `/api/v1/insurance/coi-requests/${id}?${toInsuranceQuery({ operating_company_id: operatingCompanyId })}`,
      {
        method: "PATCH",
        body: payload,
      }
    );
  },
  // "NOTHING SENDS AUTOMATICALLY. A human presses send." (owner directive 2026-08-31) -- this is
  // the only call that transitions a request to 'sent'.
  send(id: string, operatingCompanyId: string, options?: { force?: boolean; reason?: string }) {
    return apiRequest<InsuranceCoiRequest>(
      `/api/v1/insurance/coi-requests/${id}/send?${toInsuranceQuery({ operating_company_id: operatingCompanyId })}`,
      {
        method: "POST",
        body: options ?? {},
      }
    );
  },
  driverScheduleStatus(driverId: string, operatingCompanyId: string) {
    return apiRequest<DriverScheduleStatus>(
      `/api/v1/insurance/coi-requests/driver-schedule-status?${toInsuranceQuery({
        operating_company_id: operatingCompanyId,
        driver_id: driverId,
      })}`
    );
  },
};

export const insurancePaymentScheduleApi = {
  list(params: {
    operating_company_id: string;
    policy_id?: string;
    status?: PaymentScheduleStatus;
  }) {
    return apiRequest<{ payment_schedules: InsurancePaymentSchedule[] }>(
      `/api/v1/insurance/payment-schedule?${toInsuranceQuery(params)}`
    );
  },
  create(payload: CreateInsurancePaymentSchedulePayload) {
    return apiRequest<InsurancePaymentSchedule>("/api/v1/insurance/payment-schedule", {
      method: "POST",
      body: payload,
    });
  },
  markPaid(id: string, operatingCompanyId: string) {
    return apiRequest<InsurancePaymentSchedule>(
      `/api/v1/insurance/payment-schedule/${id}?${toInsuranceQuery({ operating_company_id: operatingCompanyId })}`,
      {
        method: "PATCH",
        body: {},
      }
    );
  },
};

export const insuranceClaimsApi = {
  list(params: {
    operating_company_id: string;
    policy_id?: string;
    status?: InsuranceClaimStatus;
    asset_id?: string;
    /** Filter insurance.claim.driver_id (driver reverse drill-through). */
    driver_id?: string;
    /** Filter via mdata.assets.unit_id (unit reverse drill-through). */
    unit_id?: string;
    /** Filter insurance.claim.load_id (load reverse drill-through). */
    load_id?: string;
    /** Filter insurance.claim.trailer_id -> mdata.equipment (trailer reverse drill-through, slice 2). */
    trailer_id?: string;
  }) {
    return apiRequest<{ claims: InsuranceClaim[] }>(`/api/v1/insurance/claims?${toInsuranceQuery(params)}`);
  },
  create(payload: CreateInsuranceClaimPayload) {
    return apiRequest<InsuranceClaim>("/api/v1/insurance/claims", {
      method: "POST",
      body: payload,
    });
  },
  update(id: string, operatingCompanyId: string, payload: UpdateInsuranceClaimPayload) {
    return apiRequest<InsuranceClaim>(
      `/api/v1/insurance/claims/${id}?${toInsuranceQuery({ operating_company_id: operatingCompanyId })}`,
      {
        method: "PATCH",
        body: payload,
      }
    );
  },
};

export const insuranceLawsuitsApi = {
  list(params: {
    operating_company_id: string;
    status?: InsuranceLawsuitStatus;
    claim_id?: string;
    policy_id?: string;
    driver_id?: string;
    unit_id?: string;
  }) {
    return apiRequest<{ lawsuits: InsuranceLawsuit[] }>(`/api/v1/insurance/lawsuits?${toInsuranceQuery(params)}`);
  },
  create(payload: CreateInsuranceLawsuitPayload) {
    return apiRequest<InsuranceLawsuit>("/api/v1/insurance/lawsuits", {
      method: "POST",
      body: payload,
    });
  },
  update(id: string, operatingCompanyId: string, payload: UpdateInsuranceLawsuitPayload) {
    return apiRequest<InsuranceLawsuit>(
      `/api/v1/insurance/lawsuits/${id}?${toInsuranceQuery({ operating_company_id: operatingCompanyId })}`,
      {
        method: "PATCH",
        body: payload,
      }
    );
  },
};

export function listInsurancePolicies(params: {
  operating_company_id: string;
  coverage_type?: InsuranceCoverageType;
  status?: InsurancePolicyStatus;
  vendor_id?: string;
}) {
  return insurancePoliciesApi.list(params);
}

export function getInsurancePolicy(id: string, operatingCompanyId: string) {
  return insurancePoliciesApi.get(id, operatingCompanyId);
}

export function updateInsurancePolicy(id: string, operatingCompanyId: string, payload: UpdateInsurancePolicyPayload) {
  return insurancePoliciesApi.update(id, operatingCompanyId, payload);
}

export function archiveInsurancePolicy(id: string, operatingCompanyId: string) {
  return apiRequest<void>(`/api/v1/insurance/policies/${id}?${toInsuranceQuery({ operating_company_id: operatingCompanyId })}`, {
    method: "DELETE",
  });
}

export function listInsuranceTypeCatalog(params: { operating_company_id: string; include_inactive?: boolean }) {
  return insuranceTypesApi.list(params);
}

export function createInsuranceTypeCatalog(payload: CreateInsuranceTypeCatalogPayload) {
  return insuranceTypesApi.create(payload);
}

export function updateInsuranceTypeCatalog(
  id: string,
  operatingCompanyId: string,
  payload: UpdateInsuranceTypeCatalogPayload
) {
  return insuranceTypesApi.update(id, operatingCompanyId, payload);
}

export function deactivateInsuranceTypeCatalog(id: string, operatingCompanyId: string) {
  return insuranceTypesApi.deactivate(id, operatingCompanyId);
}

export function getAssetInsuranceCoverage(assetId: string, operatingCompanyId: string) {
  return insuranceCoverageGapApi.getAssetCoverage(assetId, operatingCompanyId);
}

export type InsuranceDashboardSummary = {
  total_active_policies: number;
  policies_expiring_30d: number;
  coverage_gap_count: number;
  recent_coi_requests: number;
  open_claims: number;
  open_lawsuits: number;
};

// Single aggregate for the insurance dashboard KPI cards (replaces the old 6-query fan-out).
export function getInsuranceSummary(operatingCompanyId: string) {
  return apiRequest<{ summary: InsuranceDashboardSummary }>(
    `/api/v1/insurance/summary?${toInsuranceQuery({ operating_company_id: operatingCompanyId })}`
  );
}

export type InsuranceCoverageGapUnit = {
  unit_id: string;
  unit_number: string | null;
  missing_types: InsuranceCoverageType[];
};

// Coverage Gaps detail (INSURANCE-1) — the drill-down behind the Landing "Coverage Gap Count" KPI.
// Backed by the SAME canonical query as /insurance/summary, so coverage_gap_count ===
// uncovered_units.length + mismatched_units.length and the headline number is traceable to this list.
export type InsuranceCoverageGaps = {
  required_types: InsuranceCoverageType[];
  uncovered_units: InsuranceCoverageGapUnit[];
  mismatched_units: InsuranceCoverageGapUnit[];
  coverage_gap_count: number;
};

export function getInsuranceCoverageGaps(operatingCompanyId: string, unitId?: string) {
  const unit = unitId ? `&unit_id=${encodeURIComponent(unitId)}` : "";
  return apiRequest<InsuranceCoverageGaps>(
    `/api/v1/insurance/coverage-gaps?${toInsuranceQuery({ operating_company_id: operatingCompanyId })}${unit}`
  );
}

export function listInsuranceCoiRequests(params: {
  operating_company_id: string;
  customer_id?: string;
  policy_id?: string;
  status?: CoiRequestStatus;
}) {
  return insuranceCoiApi.list(params);
}

export function createInsuranceCoiRequest(payload: CreateCoiRequestPayload) {
  return insuranceCoiApi.create(payload);
}

export function updateInsuranceCoiRequest(id: string, operatingCompanyId: string, payload: UpdateCoiRequestPayload) {
  return insuranceCoiApi.update(id, operatingCompanyId, payload);
}

export function listInsurancePaymentSchedule(params: {
  operating_company_id: string;
  policy_id?: string;
  status?: PaymentScheduleStatus;
}) {
  return insurancePaymentScheduleApi.list(params);
}

export function createInsurancePaymentSchedule(payload: CreateInsurancePaymentSchedulePayload) {
  return insurancePaymentScheduleApi.create(payload);
}

export function markInsurancePaymentSchedulePaid(id: string, operatingCompanyId: string) {
  return insurancePaymentScheduleApi.markPaid(id, operatingCompanyId);
}

export function listInsuranceClaims(params: {
  operating_company_id: string;
  policy_id?: string;
  status?: InsuranceClaimStatus;
  asset_id?: string;
  driver_id?: string;
  unit_id?: string;
  load_id?: string;
  trailer_id?: string;
}) {
  return insuranceClaimsApi.list(params);
}

export function getInsuranceClaimGraph(id: string, operatingCompanyId: string) {
  return apiRequest<InsuranceClaimGraph>(
    `/api/v1/insurance/claims/${id}/graph?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
  );
}

export function createInsuranceClaim(payload: CreateInsuranceClaimPayload) {
  return insuranceClaimsApi.create(payload);
}

export function updateInsuranceClaim(id: string, operatingCompanyId: string, payload: UpdateInsuranceClaimPayload) {
  return insuranceClaimsApi.update(id, operatingCompanyId, payload);
}

export function listInsuranceLawsuits(params: {
  operating_company_id: string;
  status?: InsuranceLawsuitStatus;
  claim_id?: string;
  policy_id?: string;
  driver_id?: string;
  unit_id?: string;
}) {
  return insuranceLawsuitsApi.list(params);
}

export function createInsuranceLawsuit(payload: CreateInsuranceLawsuitPayload) {
  return insuranceLawsuitsApi.create(payload);
}

export function updateInsuranceLawsuit(id: string, operatingCompanyId: string, payload: UpdateInsuranceLawsuitPayload) {
  return insuranceLawsuitsApi.update(id, operatingCompanyId, payload);
}

export function listCoiRequests(customerId: string, params: { operating_company_id: string; status?: CoiRequestStatus }) {
  return listInsuranceCoiRequests({
    operating_company_id: params.operating_company_id,
    customer_id: customerId,
    status: params.status,
  });
}

export function createCoiRequest(customerId: string, payload: {
  operating_company_id: string;
  policy_id?: string | null;
  notes?: string | null;
  expires_at?: string | null;
}) {
  return createInsuranceCoiRequest({
    operating_company_id: payload.operating_company_id,
    customer_id: customerId,
    policy_id: payload.policy_id ?? null,
    notes: payload.notes ?? null,
    expires_at: payload.expires_at ?? null,
  });
}

export type AllocationMethod = "equal_split" | "pro_rata" | "weighted";

export type CreatePolicyWithBillsPayload = {
  operating_company_id: string;
  vendor_id: string;
  insurer_name: string;
  policy_number: string;
  coverage_type: InsuranceCoverageType;
  effective_date: string;
  expiry_date: string;
  total_premium_cents: number;
  down_payment_cents?: number;
  term_months: number;
  allocation_method: AllocationMethod;
  manual_pcts?: Record<string, number>;
  unit_ids: string[];
  due_day?: number | null;
  pay_day?: number | null;
  late_fee_pct?: number;
  status?: InsurancePolicyStatus;
  insurer_email?: string | null;
  agent_contact?: string | null;
};

export type CreatePolicyWithBillsResult = {
  policyId: string;
  unitCount: number;
  billCount: number;
  totalAmountCents: number;
};

export function createPolicyWithBills(
  payload: CreatePolicyWithBillsPayload
): Promise<CreatePolicyWithBillsResult> {
  return apiRequest<CreatePolicyWithBillsResult>("/api/v1/insurance/policies/with-bills", {
    method: "POST",
    body: payload,
  });
}
