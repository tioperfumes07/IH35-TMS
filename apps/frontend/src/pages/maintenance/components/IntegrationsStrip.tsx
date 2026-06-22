import { useQuery } from "@tanstack/react-query";
import { getQboConnectionStatus } from "../../../api/forensic";
import { getSamsaraHealth } from "../../../api/samsara";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { qboConnectionLabel, RELAY_NOT_CONFIGURED, resolveSamsaraVisualStatus } from "../../../lib/integration-telematics-status";

type Props = {
  pendingQboCount: number;
};

function dotClass(dot: "gray" | "green" | "yellow" | "red"): string {
  if (dot === "green") return "bg-emerald-500";
  if (dot === "yellow") return "bg-amber-400";
  if (dot === "red") return "bg-red-500";
  return "bg-slate-400";
}

export function IntegrationsStrip({ pendingQboCount }: Props) {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const samsaraQuery = useQuery({
    queryKey: ["integrations", "samsara", "health", companyId],
    queryFn: () => getSamsaraHealth(companyId),
    enabled: Boolean(companyId),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const qboQuery = useQuery({
    queryKey: ["integrations", "qbo", "status", companyId],
    queryFn: () => getQboConnectionStatus(companyId),
    enabled: Boolean(companyId),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const samsaraVis = resolveSamsaraVisualStatus(samsaraQuery.data);
  const qboVis = qboConnectionLabel(qboQuery.data?.connected);
  const relayVis = RELAY_NOT_CONFIGURED;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600">
      <span className="inline-flex items-center gap-1">
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotClass(qboVis.dot)}`} />
        {qboVis.label}
      </span>
      <span className="text-gray-300">·</span>
      <span className="inline-flex items-center gap-1" title={samsaraVis.title}>
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotClass(samsaraVis.dot)}`} />
        {samsaraVis.label}
      </span>
      <span className="text-gray-300">·</span>
      <span className="inline-flex items-center gap-1">
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotClass(relayVis.dot)}`} />
        {relayVis.label}
      </span>
      <span className="text-gray-300">·</span>
      <span>
        {pendingQboCount} pending QBO sync
      </span>
      <span className="text-gray-300">·</span>
      <button type="button" className="text-slate-700 underline">
        View sync log →
      </button>
    </div>
  );
}
