import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompanyContext } from "../contexts/CompanyContext";
import { resolveApiUrl } from "../api/client";

export type RoadServiceStatus = "open" | "completed" | "invoiced" | "paid";
export type RoadServiceType = "tire_change" | "jump_start" | "fuel_delivery" | "lockout" | "tow" | "other";

export type RoadServiceTicket = {
  id: string;
  ticket_number: string;
  vendor_name: string;
  vendor_id?: string | null;
  unit_id: string;
  unit_display_id?: string | null;
  driver_id?: string | null;
  driver_name?: string | null;
  service_type: RoadServiceType;
  initial_complaint?: string | null;
  work_performed?: string | null;
  parts_used?: string | null;
  total_cost_cents: number;
  status: RoadServiceStatus;
  location_address?: string | null;
  wo_id?: string | null;
  work_order_display_id?: string | null;
  bill_id?: string | null;
  created_at: string;
  // ETA / RESPONSE — when the provider arrived on-scene (real column, returned via t.* by the tickets list).
  on_scene_time?: string | null;
};

// SAF-F06 class: bare fetch(path) resolves against the SPA origin, which returns
// index.html with HTTP 200 — res.ok stays true and res.json() throws on HTML, so the
// call fails silently and renders as empty. resolveApiUrl() applies VITE_API_BASE_URL.
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(resolveApiUrl(path), {
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

export function useRoadServiceTickets(filters?: { status?: RoadServiceStatus; unit_id?: string; driver_id?: string; vendor_id?: string; wo_id?: string }) {
  const { selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();
  const operatingCompanyId = selectedCompanyId ?? "";

  const listQuery = useQuery({
    queryKey: ["maintenance", "road-service", operatingCompanyId, filters?.status, filters?.unit_id, filters?.driver_id, filters?.vendor_id, filters?.wo_id],
    queryFn: () => {
      const params = new URLSearchParams({ operating_company_id: operatingCompanyId });
      if (filters?.status) params.set("status", filters.status);
      if (filters?.unit_id) params.set("unit_id", filters.unit_id);
      if (filters?.driver_id) params.set("driver_id", filters.driver_id);
      if (filters?.vendor_id) params.set("vendor_id", filters.vendor_id);
      if (filters?.wo_id) params.set("wo_id", filters.wo_id);
      return apiFetch<{ tickets: RoadServiceTicket[] }>(`/api/v1/road-service-tickets?${params.toString()}`);
    },
    enabled: Boolean(operatingCompanyId),
  });

  const createTicket = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiFetch<{ ticket: RoadServiceTicket }>("/api/v1/road-service-tickets", {
        method: "POST",
        body: JSON.stringify({ operating_company_id: operatingCompanyId, ...payload }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["maintenance", "road-service", operatingCompanyId] }),
  });

  const completeTicket = useMutation({
    mutationFn: (input: { id: string; work_performed: string; total_cost_cents: number; parts_used?: string }) =>
      apiFetch<{ ticket: RoadServiceTicket }>(`/api/v1/road-service-tickets/${input.id}/complete`, {
        method: "PATCH",
        body: JSON.stringify({
          operating_company_id: operatingCompanyId,
          work_performed: input.work_performed,
          total_cost_cents: input.total_cost_cents,
          parts_used: input.parts_used,
        }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["maintenance", "road-service", operatingCompanyId] }),
  });

  const createWo = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ wo_id: string; bill_id: string | null }>(`/api/v1/road-service-tickets/${id}/create-wo`, {
        method: "POST",
        body: JSON.stringify({ operating_company_id: operatingCompanyId }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["maintenance", "road-service", operatingCompanyId] }),
  });

  return {
    tickets: listQuery.data?.tickets ?? [],
    isLoading: listQuery.isLoading,
    isError: listQuery.isError,
    createTicket,
    completeTicket,
    createWo,
  };
}
