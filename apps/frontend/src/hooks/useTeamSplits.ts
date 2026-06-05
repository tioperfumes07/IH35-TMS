import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../api/client";

export type TeamSplitStatus = "active" | "paused" | "ended";
export type TeamSplitType = "percentage" | "fixed" | "mileage";

export type TeamSplitConfig = {
  id: string;
  operating_company_id?: string;
  primary_driver_id: string;
  secondary_driver_id: string;
  primary_driver_name?: string;
  secondary_driver_name?: string;
  split_type: TeamSplitType;
  primary_ratio: number;
  secondary_ratio: number;
  effective_from_date: string;
  effective_to_date?: string | null;
  status: TeamSplitStatus;
  memo?: string | null;
};

export type CreateTeamSplitConfigInput = {
  primary_driver_id: string;
  secondary_driver_id: string;
  split_type?: TeamSplitType;
  primary_ratio: number;
  secondary_ratio: number;
  effective_from_date?: string;
  effective_to_date?: string | null;
  memo?: string;
};

function withCompanyQuery(path: string, operatingCompanyId: string) {
  const params = new URLSearchParams({ operating_company_id: operatingCompanyId });
  return `${path}?${params.toString()}`;
}

export async function listTeamSplitConfigs(operatingCompanyId: string, filters?: { driver_id?: string; status?: string }) {
  const params = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (filters?.driver_id) params.set("driver_id", filters.driver_id);
  if (filters?.status) params.set("status", filters.status);
  return apiRequest<{ configs: TeamSplitConfig[] }>(`/api/v1/team-splits/configs?${params.toString()}`);
}

export function useTeamSplits(operatingCompanyId: string | null) {
  const queryClient = useQueryClient();
  const queryKey = ["team-split-configs", operatingCompanyId];

  const query = useQuery({
    queryKey,
    enabled: Boolean(operatingCompanyId),
    queryFn: () => listTeamSplitConfigs(operatingCompanyId!),
  });

  const create = useMutation({
    mutationFn: (input: CreateTeamSplitConfigInput) =>
      apiRequest<{ config: TeamSplitConfig }>(withCompanyQuery("/api/v1/team-splits/configs", operatingCompanyId!), {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const endConfig = useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ ok: true }>(withCompanyQuery(`/api/v1/team-splits/configs/${id}`, operatingCompanyId!), {
        method: "DELETE",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  return { ...query, create, endConfig };
}
