import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../api/client";

export type AutoDeductionDeductionType =
  | "damage"
  | "cash_advance"
  | "repair"
  | "fine"
  | "fuel_advance"
  | "other";

export type AutoDeductionPolicyStatus = "active" | "paused" | "completed";

export type AutoDeductionPolicy = {
  id: string;
  operating_company_id?: string;
  driver_id: string;
  deduction_type: AutoDeductionDeductionType;
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

export function useAutoDeductionPolicies(operatingCompanyId: string) {
  return useQuery({
    queryKey: ["auto-deduction-policies", operatingCompanyId],
    enabled: Boolean(operatingCompanyId),
    queryFn: () => listAutoDeductionPolicies(operatingCompanyId),
  });
}

export function useAutoDeductionPolicyMutations(operatingCompanyId: string) {
  const queryClient = useQueryClient();
  const queryKey = ["auto-deduction-policies", operatingCompanyId];

  const createMutation = useMutation({
    mutationFn: (body: CreateAutoDeductionPolicyInput) =>
      apiRequest<{ policy: AutoDeductionPolicy }>(withCompanyQuery("/api/v1/auto-deductions/policies", operatingCompanyId), {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: PatchAutoDeductionPolicyInput }) =>
      apiRequest<{ policy: AutoDeductionPolicy }>(withCompanyQuery(`/api/v1/auto-deductions/policies/${id}`, operatingCompanyId), {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ ok: true }>(withCompanyQuery(`/api/v1/auto-deductions/policies/${id}`, operatingCompanyId), {
        method: "DELETE",
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
  });

  return { createMutation, patchMutation, cancelMutation };
}
