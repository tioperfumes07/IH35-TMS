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
export type CoiRequestStatus = "pending" | "sent" | "received" | "expired" | "dismissed";
export type PaymentScheduleStatus = "scheduled" | "reminded" | "paid" | "overdue" | "late_fee_applied";
export type InsuranceClaimStatus = "open" | "investigating" | "approved" | "denied" | "paid" | "closed";
export type InsuranceLawsuitStatus = "filed" | "active" | "settled" | "dismissed" | "judgment";

export type InsurancePolicy = {
  id: string;
  insurer_name: string;
  policy_number: string;
  coverage_type: InsuranceCoverageType;
  coverage_type_id: string | null;
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
  insured_value_cents: number;
  created_at: string;
  updated_at: string;
};

export type InsurancePolicyDetail = InsurancePolicy & {
  units: InsurancePolicyUnit[];
};

export type CreateInsurancePolicyPayload = {
  operating_company_id: string;
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
  /** Accounting vendor ID (from mdata.qbo_vendors). When set with installment_count > 0,
   *  the backend generates accounting.bills via createBill() for each installment. */
  vendor_id?: string | null;
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
  customer_id: string;
  policy_id: string | null;
  requested_at: string;
  requested_by: string | null;
  status: CoiRequestStatus;
  notes: string | null;
  document_url: string | null;
  expires_at: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateCoiRequestPayload = {
  operating_company_id: string;
  customer_id: string;
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
  policy_id?: string | null;
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
  accident_date: string;
  reported_date: string;
  status: InsuranceClaimStatus;
  amount_claimed_cents: number;
  amount_paid_cents: number;
  adjuster_name: string | null;
  adjuster_email: string | null;
  notes: string | null;
  created_at: string;
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
    status?: CoiRequestStatus;
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

export function listInsuranceCoiRequests(params: {
  operating_company_id: string;
  customer_id?: string;
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
}) {
  return insuranceClaimsApi.list(params);
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
