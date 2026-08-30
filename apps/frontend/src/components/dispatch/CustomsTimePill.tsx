import { useQuery } from "@tanstack/react-query";
import { resolveApiUrl } from "../../api/client";

interface Props {
  operatingCompanyId: string;
  crossingPoint: string;
  direction: "northbound" | "southbound";
}

export function CustomsTimePill({ operatingCompanyId, crossingPoint, direction }: Props) {
  const query = useQuery({
    queryKey: ["customs-time-avg", operatingCompanyId, crossingPoint, direction],
    queryFn: async () => {
      const res = await fetch(resolveApiUrl(`/api/v1/dispatch/border-crossings/customs-time-avg?operating_company_id=${encodeURIComponent(operatingCompanyId)}&crossing=${encodeURIComponent(crossingPoint)}&direction=${direction}`),
        { credentials: "include" }
      );
      if (!res.ok) throw new Error(`Customs wait time request failed (HTTP ${res.status})`);
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  if (query.isError) {
    return (
      <button
        type="button"
        data-customs-time-retry
        className="rounded-sm border border-slate-200 bg-slate-100 px-1 text-[10px] font-medium text-slate-700"
        title="Customs wait time unavailable — retry"
        onClick={(event) => {
          event.stopPropagation();
          void query.refetch();
        }}
      >
        Retry wait time
      </button>
    );
  }

  const avg = query.data?.data?.avg_minutes;
  if (avg == null) return null;

  const color =
    avg < 45
      ? "bg-slate-100 text-slate-700"
      : avg < 90
        ? "bg-slate-100 text-slate-700"
        : "bg-red-100 text-red-800";

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      ~{avg}min customs
    </span>
  );
}
