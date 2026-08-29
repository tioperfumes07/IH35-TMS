import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../api/client";
import { useToast } from "../components/Toast";
import { userFacingApiError } from "../lib/api-error-message";

/** catalogs.driver_deduction_types.code */
export type AutoDeductionDeductionType = string;

export type AutoDeductionPolicyStatus = "active" | "paused" | "completed";

export type AutoDeductionPolicy = {
  id: string;
  operating_company_id?: string;
  driver_id: string;
  /** FAIL-DD1 — projected from mdata.drivers on list; EntityLink label (never raw UUID title). */
  driver_name?: string | null;
  deduction_type: AutoDeductionDeductionType;
  /** SETL-LINK-01 — joined from catalogs.driver_deduction_types */
  /** AUTO-DEDUCTION-POLICY-HISTORY-NO-HUMAN-LABEL — the canonical type label; never raw uuid. */
  deduction_type_display_name?: string | null;
  default_recovery_rail?: string | null;
  may_draw_escrow?: boolean | null;
  survives_separation?: boolean | null;
  total_owed_cents: number;
  deducted_so_far_cents: number;
  max_per_settlement_cents: number;
  created_by_user_id?: string | null;
  status: AutoDeductionPolicyStatus;
  memo?: string | null;
  source_ref?: string | null;
  created_at?: string;
  completed_at?: string | null;
};

export type CreateAutoDeductionPolicyInput = {
  driver_id: string;
  deduction_type: AutoDeductionDeductionType;
  total_owed_cents: number;
  max_per_settlement_cents: number;
  memo?: string;
  source_ref?: string;
};

export type PatchAutoDeductionPolicyInput = {
  status?: "active" | "paused" | "completed";
  max_per_settlement_cents?: number;
  memo?: string;
};

function withCompanyQuery(path: string, operatingCompanyId: string) {
  const params = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return `${path}?${params.toString()}`;
}

export async function listAutoDeductionPolicies(operatingCompanyId: string, filters?: { driver_id?: string; status?: string }) {
  const params = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (filters?.driver_id) params.set("driver_id", filters.driver_id);
  if (filters?.status) params.set("status", filters.status);
  return apiRequest<{ rows: AutoDeductionPolicy[] }>(`/api/v1/auto-deductions/policies?${params.toString()}`);
}

export function useAutoDeductionPolicies(operatingCompanyId: string, driverId?: string) {
  return useQuery({
    queryKey: ["auto-deduction-policies", operatingCompanyId, driverId ?? null],
    enabled: Boolean(operatingCompanyId),
    queryFn: () => listAutoDeductionPolicies(operatingCompanyId, driverId ? { driver_id: driverId } : undefined),
  });
}

export function useAutoDeductionPolicyMutations(operatingCompanyId: string) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const queryKey = ["auto-deduction-policies", operatingCompanyId];

  const createMutation = useMutation({
    mutationFn: (body: CreateAutoDeductionPolicyInput) =>
      apiRequest<{ policy: AutoDeductionPolicy }>(withCompanyQuery("/api/v1/auto-deductions/policies", operatingCompanyId), {
        method: "POST",
        body,
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
    onError: (error) => pushToast(userFacingApiError(error, "Could not create auto-deduction policy"), "error"),
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: PatchAutoDeductionPolicyInput }) =>
      apiRequest<{ policy: AutoDeductionPolicy }>(withCompanyQuery(`/api/v1/auto-deductions/policies/${id}`, operatingCompanyId), {
        method: "PATCH",
        body,
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
    onError: (error) => pushToast(userFacingApiError(error, "Could not update auto-deduction policy"), "error"),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ ok: true }>(withCompanyQuery(`/api/v1/auto-deductions/policies/${id}`, operatingCompanyId), {
        method: "DELETE",
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
    onError: (error) => pushToast(userFacingApiError(error, "Could not cancel auto-deduction policy"), "error"),
  });

  return { createMutation, patchMutation, cancelMutation };
}
