import { useQuery } from "@tanstack/react-query";
import { getDispatchLoadEta } from "../../api/dispatch";
import { formatClockTimeCT } from "../../lib/businessDate";

type Props = {
  loadId: string;
  operatingCompanyId: string;
};

function sourceGlyph(source: string) {
  if (source === "samsara") return "📡";
  if (source === "manual") return "✎";
  return "◌";
}

export function InTransitEtaChip({ loadId, operatingCompanyId }: Props) {
  const q = useQuery({
    queryKey: ["dispatch", "load-eta", loadId, operatingCompanyId],
    queryFn: () => getDispatchLoadEta(loadId, operatingCompanyId),
    refetchInterval: 60_000,
    enabled: Boolean(loadId && operatingCompanyId),
    retry: false,
  });

  if (q.isLoading) {
    return <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">ETA …</span>;
  }
  if (q.isError) {
    return <span className="text-[11px] text-gray-400">—</span>;
  }
  const data = q.data;
  if (!data) return null;
  // Central Time (CLAUDE.md §8 "Central Time always") — never the dispatcher's browser zone.
  const timeStr = formatClockTimeCT(data.eta_at) || data.eta_at;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-800"
      title={`ETA source: ${data.source}`}
    >
      <span aria-hidden>{sourceGlyph(data.source)}</span>
      <span>ETA {timeStr}</span>
    </span>
  );
}
