import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompanyContext } from "../contexts/CompanyContext";

export type SettlementDisputeType =
  | "missing_line"
  | "incorrect_rate"
  | "duplicate_deduction"
  | "wrong_unit"
  | "other";

export type SettlementDisputeStatus = "submitted" | "in_review" | "approved" | "denied" | "partial";

export type SettlementDisputeRow = {
  id: string;
  settlement_id: string;
  driver_id: string;
  driver_name?: string | null;
  settlement_display_id?: string | null;
  dispute_type: SettlementDisputeType;
  claimed_amount_cents: number;
  description: string;
  evidence_doc_ids?: string[] | null;
  status: SettlementDisputeStatus;
  resolution_amount_cents?: number | null;
  resolution_notes?: string | null;
  reviewed_by_user_id?: string | null;
  reviewed_at?: string | null;
  qbo_adjustment_je_id?: string | null;
  created_at: string;
};

type ListResponse = {
  disputes: SettlementDisputeRow[];
  total: number;
  limit: number;
  offset: number;
};

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `request_failed_${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function useSettlementDisputes(options: { status?: SettlementDisputeStatus; driverId?: string; enabled?: boolean } = {}) {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ["settlement-disputes", companyId, options.status ?? "all", options.driverId ?? ""],
    enabled: Boolean(companyId) && (options.enabled ?? true),
    queryFn: async () => {
      const params = new URLSearchParams({ operating_company_id: companyId });
      if (options.status) params.set("status", options.status);
      if (options.driverId) params.set("driver_id", options.driverId);
      return apiFetch<ListResponse>(`/api/v1/settlement-disputes?${params.toString()}`);
    },
  });

  const openCount =
    listQuery.data?.disputes.filter((row) => row.status === "submitted" || row.status === "in_review").length ?? 0;

  const createMutation = useMutation({
    mutationFn: (input: {
      settlementId: string;
      driver_id: string;
      dispute_type: SettlementDisputeType;
      claimed_amount_cents: number;
      description: string;
      evidence_doc_ids?: string[];
    }) =>
      apiFetch<{ data: { id: string } }>(`/api/v1/settlements/${input.settlementId}/disputes`, {
        method: "POST",
        body: JSON.stringify({
          operating_company_id: companyId,
          driver_id: input.driver_id,
          dispute_type: input.dispute_type,
          claimed_amount_cents: input.claimed_amount_cents,
          description: input.description,
          evidence_doc_ids: input.evidence_doc_ids,
        }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["settlement-disputes", companyId] });
    },
  });

  const reviewMutation = useMutation({
    mutationFn: (input: {
      id: string;
      status: "in_review" | "approved" | "denied" | "partial";
      resolution_amount_cents?: number;
      resolution_notes?: string;
    }) =>
      apiFetch<{ data: { id: string } }>(`/api/v1/settlement-disputes/${input.id}/review`, {
        method: "PATCH",
        body: JSON.stringify({
          operating_company_id: companyId,
          status: input.status,
          resolution_amount_cents: input.resolution_amount_cents,
          resolution_notes: input.resolution_notes,
        }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["settlement-disputes", companyId] });
    },
  });

  return {
    disputes: listQuery.data?.disputes ?? [],
    openCount,
    isLoading: listQuery.isLoading,
    createDispute: createMutation.mutateAsync,
    reviewDispute: reviewMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isReviewing: reviewMutation.isPending,
  };
}
