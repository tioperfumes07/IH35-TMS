/**
 * E-22 registry — fuel card -> truck (+ driver) over effective dates. Backend:
 * apps/backend/src/fuel/fuel-card-assignments.routes.ts / .service.ts
 * (table fuel.fuel_card_assignments, migration 202615140600). Writes are
 * Owner/Administrator/Accountant only (403 otherwise) — mirror with useCanVoidCancel().
 */
import { apiRequest } from "./client";

export type FuelCardAssignment = {
  id: string;
  operating_company_id: string;
  fuel_card_type_id: string | null;
  fuel_card_type_name: string | null;
  card_last_digits: string;
  unit_id: string;
  unit_number: string | null;
  driver_id: string | null;
  driver_name: string | null;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
  created_at: string;
  voided_at: string | null;
  void_reason: string | null;
};

export type FuelCardAssignmentListFilter = {
  unit_id?: string;
  driver_id?: string;
  card_last_digits?: string;
  include_voided?: boolean;
};

export type CreateFuelCardAssignmentBody = {
  card_last_digits: string;
  unit_id: string;
  driver_id?: string | null;
  fuel_card_type_id?: string | null;
  effective_from: string;
  effective_to?: string | null;
  notes?: string | null;
};

function companyQuery(companyId: string, extra?: Record<string, string | undefined>) {
  const params = new URLSearchParams({ operating_company_id: companyId });
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (value) params.set(key, value);
  }
  return params.toString();
}

export function listFuelCardAssignments(companyId: string, filter: FuelCardAssignmentListFilter = {}) {
  const qs = companyQuery(companyId, {
    unit_id: filter.unit_id,
    driver_id: filter.driver_id,
    card_last_digits: filter.card_last_digits,
    include_voided: filter.include_voided ? "true" : undefined,
  });
  return apiRequest<{ rows: FuelCardAssignment[] }>(`/api/v1/fuel/card-assignments?${qs}`);
}

export function createFuelCardAssignment(companyId: string, body: CreateFuelCardAssignmentBody) {
  return apiRequest<FuelCardAssignment>(`/api/v1/fuel/card-assignments?${companyQuery(companyId)}`, {
    method: "POST",
    body,
  });
}

export function endFuelCardAssignment(companyId: string, id: string, effective_to: string) {
  return apiRequest<FuelCardAssignment>(`/api/v1/fuel/card-assignments/${id}/end?${companyQuery(companyId)}`, {
    method: "POST",
    body: { effective_to },
  });
}

export function voidFuelCardAssignment(companyId: string, id: string, reason: string) {
  return apiRequest<FuelCardAssignment>(`/api/v1/fuel/card-assignments/${id}/void?${companyQuery(companyId)}`, {
    method: "POST",
    body: { reason },
  });
}
