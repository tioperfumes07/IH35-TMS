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
  const count = q.data ?? 0;
  return (
    <a href="/safety/anomaly" className="relative inline-flex items-center rounded p-1 text-slate-600 hover:bg-gray-100" title="Anomaly alerts">
      <Bell size={18} />
      {count > 0 ? (
        <span className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{count}</span>
      ) : null}
    </a>
  );
}
