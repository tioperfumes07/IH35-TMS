import { useQuery } from "@tanstack/react-query";
import { ListErrorState } from "../ListErrorState";
import { EntityLink } from "../shared/EntityLink";
import { listTeamSplitConfigs } from "../../hooks/useTeamSplits";

export function DriverTeamSplitConfigReverseSection({
  driverId,
  operatingCompanyId,
}: {
  driverId: string;
  operatingCompanyId: string;
}) {
  const query = useQuery({
    queryKey: ["team-split-configs", "driver-profile", operatingCompanyId, driverId],
    queryFn: () => listTeamSplitConfigs(operatingCompanyId, { driver_id: driverId }),
    enabled: Boolean(driverId && operatingCompanyId),
  });
  const configs = query.data?.configs ?? [];

  return (
    <section className="rounded-sm border border-gray-200 bg-white p-3" data-testid="driver-team-split-config-reverse">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Team split configurations</h2>
        <EntityLink kind="driver_team_splits_filter" id={driverId} label="Open team splits" className="text-xs font-semibold text-slate-700 hover:underline" />
      </div>
      {query.isError ? (
        <ListErrorState
          title="Couldn't load team split configurations"
          status={0}
          message={(query.error as Error | null)?.message}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {query.isLoading ? <p className="mt-2 text-xs text-gray-500">Loading…</p> : null}
      {!query.isLoading && !query.isError && configs.length === 0 ? <p className="mt-2 text-xs text-gray-500">No team split configuration includes this driver.</p> : null}
      <ul className="mt-2 space-y-1">
        {configs.slice(0, 5).map((config) => (
          <li key={config.id}>
            <EntityLink
              kind="driver_team_split"
              id={config.id}
              label={`${Math.round(Number(config.primary_ratio) * 100)}% / ${Math.round(Number(config.secondary_ratio) * 100)}% · ${config.status}`}
              className="text-xs font-semibold text-slate-700 hover:underline"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
