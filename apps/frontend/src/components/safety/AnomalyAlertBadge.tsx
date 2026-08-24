import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { apiRequest } from "../../api/client";

type Props = { operatingCompanyId: string };

export function AnomalyAlertBadge({ operatingCompanyId }: Props) {
  const q = useQuery({
    queryKey: ["anomaly-open-critical", operatingCompanyId],
    enabled: Boolean(operatingCompanyId),
    queryFn: async () => {
      const res = await apiRequest<{ alerts: Array<{ severity: string }> }>(
        `/api/safety/anomaly/alerts?operating_company_id=${encodeURIComponent(operatingCompanyId)}&status=open&severity=critical`
      );
      return res.alerts?.length ?? 0;
    },
    refetchInterval: 60_000,
  });

  if (q.isError) {
    return (
      <button
        type="button"
        className="relative inline-flex items-center rounded-sm p-1 text-red-700 hover:bg-red-50"
        title="Critical anomaly alerts couldn't be loaded. Retry."
        aria-label="Retry critical anomaly alerts"
        onClick={() => void q.refetch()}
      >
        <Bell size={18} />
        <span className="absolute -right-1 -top-1 rounded-full bg-red-700 px-1 text-[10px] font-bold text-white">!</span>
      </button>
    );
  }

  const count = q.data ?? 0;
  return (
    <a href="/safety/anomaly-alerts" className="relative inline-flex items-center rounded-sm p-1 text-slate-600 hover:bg-gray-100" title="Anomaly alerts">
      <Bell size={18} />
      {count > 0 ? (
        <span className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{count}</span>
      ) : null}
    </a>
  );
}
