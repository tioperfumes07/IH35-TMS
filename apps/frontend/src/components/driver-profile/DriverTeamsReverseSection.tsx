import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { driverTeamMemberName, listMdataDriverTeams } from "../../api/driver-teams";

export function DriverTeamsReverseSection({ driverId, operatingCompanyId }: { driverId: string; operatingCompanyId: string }) {
  const query = useQuery({
    queryKey: ["mdata", "driver-teams", "driver-profile", operatingCompanyId, driverId],
    queryFn: () => listMdataDriverTeams({ operating_company_id: operatingCompanyId, is_active: "true" }),
    enabled: Boolean(driverId && operatingCompanyId),
  });
  const teams = (query.data?.teams ?? []).filter(
    (team) => team.primary_driver_id === driverId || team.secondary_driver_id === driverId
  );

  return (
    <section className="rounded-sm border border-gray-200 bg-white p-3" data-testid="driver-profile-teams-reverse">
      <h2 className="mb-2 text-sm font-semibold text-slate-900">Driver teams</h2>
      {query.isError ? <p className="text-xs text-red-700">Driver teams failed to load.</p> : null}
      {query.isLoading ? <p className="text-xs text-gray-500">Loading driver teams…</p> : null}
      {!query.isLoading && !query.isError && teams.length === 0 ? (
        <p className="text-xs text-gray-500">No active driver team includes this driver.</p>
      ) : null}
      <ul className="divide-y divide-gray-100">
        {teams.map((team) => {
          const teammate = team.primary_driver_id === driverId
            ? driverTeamMemberName(team, "secondary")
            : driverTeamMemberName(team, "primary");
          return (
            <li key={team.id} className="flex items-center justify-between gap-3 py-2 text-xs">
              <Link
                to={`/lists/driver/teams?team_id=${encodeURIComponent(team.id)}`}
                className="font-semibold text-slate-700 hover:underline"
              >
                {team.team_name}
              </Link>
              <span className="text-gray-500">Teammate: {teammate}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
