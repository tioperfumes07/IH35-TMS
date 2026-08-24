import { useQuery } from "@tanstack/react-query";
import { getQboConnectionStatus } from "../../../api/forensic";
import { getRelayHealth } from "../../../api/relay";
import { getSamsaraHealth } from "../../../api/samsara";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { qboConnectionLabel, resolveRelayVisualStatus, resolveSamsaraVisualStatus } from "../../../lib/integration-telematics-status";

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
  const { selectedCompanyId, selectedCompany } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  // Entity capability law: only TRANSP owns the live QBO mirror. USMCA/TRK are TMS-native and must
  // neither poll QBO nor render a permanent "not connected" / pending-sync false alarm.
  const qboCapable = selectedCompany?.code?.trim().toUpperCase() === "TRANSP";

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
    enabled: Boolean(companyId && qboCapable),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const relayQuery = useQuery({
    queryKey: ["integrations", "relay", "health", companyId],
    queryFn: () => getRelayHealth(companyId),
    enabled: Boolean(companyId),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const samsaraVis = resolveSamsaraVisualStatus(samsaraQuery.data);
  const qboVis = qboConnectionLabel(qboQuery.data?.connected, qboQuery.data?.needs_reauth);
  const relayVis = resolveRelayVisualStatus(relayQuery.data);

  const samsaraStatus = samsaraQuery.isError ? (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-red-700 underline"
      title="Samsara health couldn't be loaded. Retry."
      onClick={() => void samsaraQuery.refetch()}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotClass("red")}`} />
      Samsara: unavailable
    </button>
  ) : (
    <span className="inline-flex items-center gap-1" title={samsaraVis.title}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotClass(samsaraVis.dot)}`} />
      {samsaraVis.label}
    </span>
  );

  const relayStatus = relayQuery.isError ? (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-red-700 underline"
      title="Relay health couldn't be loaded. Retry."
      onClick={() => void relayQuery.refetch()}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotClass("red")}`} />
      Relay: unavailable
    </button>
  ) : (
    <span className="inline-flex items-center gap-1" title={relayVis.title}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotClass(relayVis.dot)}`} />
      {relayVis.label}
    </span>
  );

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-sm border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600">
      {qboCapable ? (
        <>
          <span className="inline-flex items-center gap-1">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotClass(qboVis.dot)}`} />
            {qboVis.label}
          </span>
          <span className="text-gray-300">·</span>
        </>
      ) : null}
      {samsaraStatus}
      <span className="text-gray-300">·</span>
      {relayStatus}
      {qboCapable ? (
        <>
          <span className="text-gray-300">·</span>
          <span>{pendingQboCount} pending QBO sync</span>
          <span className="text-gray-300">·</span>
          <button type="button" className="text-slate-700 underline">
            View sync log →
          </button>
        </>
      ) : null}
    </div>
  );
}
