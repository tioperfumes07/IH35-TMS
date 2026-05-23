import { useQuery } from "@tanstack/react-query";
import { getDriverHosStatus } from "../../api/dispatch";

type Props = {
  driverId: string | null;
  operatingCompanyId: string;
};

function toClock(minutes: number) {
  const safe = Math.max(0, Math.floor(minutes));
  const hrs = Math.floor(safe / 60);
  const mins = safe % 60;
  return `${hrs}h ${mins}m`;
}

function pillClass(status: "ok" | "warning_1hr" | "warning_15min" | "violation") {
  if (status === "violation") return "bg-red-100 text-red-700";
  if (status === "warning_15min" || status === "warning_1hr") return "bg-amber-100 text-amber-700";
  return "bg-emerald-100 text-emerald-700";
}

function label(status: "ok" | "warning_1hr" | "warning_15min" | "violation") {
  if (status === "violation") return "HOS VIOL";
  if (status === "warning_15min") return "HOS <15m";
  if (status === "warning_1hr") return "HOS <1h";
  return "HOS OK";
}

export function DriverHosPill({ driverId, operatingCompanyId }: Props) {
  const enabled = Boolean(driverId && operatingCompanyId);
  const hosQuery = useQuery({
    queryKey: ["dispatch-driver-hos", operatingCompanyId, driverId],
    queryFn: () => getDriverHosStatus(String(driverId), operatingCompanyId),
    enabled,
    staleTime: 60_000,
    retry: false,
  });

  if (!enabled) return <span className="text-[10px] text-gray-300">—</span>;
  if (hosQuery.isLoading) return <span className="text-[10px] text-gray-400">HOS ...</span>;
  if (!hosQuery.data) return <span className="text-[10px] text-gray-300">—</span>;

  const row = hosQuery.data;
  const tooltip = `Drive ${toClock(row.drive_remaining_min)} | Window ${toClock(row.window_remaining_min)} | Break ${toClock(row.break_remaining_min)}`;
  return (
    <span title={tooltip} className={`rounded-full px-2 py-1 text-[10px] font-semibold ${pillClass(row.status)}`}>
      {label(row.status)}
    </span>
  );
}
