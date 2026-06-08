import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";

type Props = {
  operatingCompanyId: string;
  loadId: string;
  reefer: boolean;
};

type CargoTimelineResponse = {
  threshold: { min_temp_c: number; max_temp_c: number };
  rows: Array<{
    temp_celsius: number | null;
    out_of_range: boolean;
    threshold_status?: "green" | "amber" | "red";
    reading_at: string;
  }>;
};

function statusClass(status: "green" | "amber" | "red") {
  if (status === "red") return "bg-red-100 text-red-800";
  if (status === "amber") return "bg-amber-100 text-amber-800";
  return "bg-emerald-100 text-emerald-800";
}

function statusLabel(status: "green" | "amber" | "red") {
  if (status === "red") return "Out";
  if (status === "amber") return "Edge";
  return "In";
}

export function isReeferCommodity(commodity?: string | null): boolean {
  const value = (commodity ?? "").toLowerCase();
  return value.includes("reefer") || value.includes("refrigerat");
}

export function CargoTempBadge({ operatingCompanyId, loadId, reefer }: Props) {
  const timeline = useQuery({
    queryKey: ["cargo-sensor-badge", operatingCompanyId, loadId],
    queryFn: () =>
      apiRequest<CargoTimelineResponse>(
        `/api/v1/dispatch/cargo-sensors/load/${encodeURIComponent(loadId)}/timeline?operating_company_id=${encodeURIComponent(
          operatingCompanyId
        )}&limit=1`
      ),
    enabled: Boolean(reefer && operatingCompanyId && loadId),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  if (!reefer) return <span className="text-[11px] text-gray-300">—</span>;
  if (timeline.isLoading) {
    return <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">Temp …</span>;
  }
  if (timeline.isError || !timeline.data) {
    return <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">No sensor</span>;
  }

  const latest = timeline.data.rows[0];
  if (!latest) {
    return <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">No sensor</span>;
  }

  const status = latest.threshold_status ?? (latest.out_of_range ? "red" : "green");
  const tempLabel = latest.temp_celsius != null ? `${latest.temp_celsius.toFixed(1)}C` : "No temp";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass(status)}`}
      data-testid={`cargo-temp-badge-${loadId}`}
    >
      {statusLabel(status)} {tempLabel}
    </span>
  );
}
