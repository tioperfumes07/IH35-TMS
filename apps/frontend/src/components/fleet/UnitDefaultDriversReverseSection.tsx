import { useQuery } from "@tanstack/react-query";
import { listUnitDefaultDrivers } from "../../api/mdata";
import { formatDateTimeUS } from "../../lib/formatDate";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";

export function UnitDefaultDriversReverseSection({ operatingCompanyId, unitId }: { operatingCompanyId: string; unitId: string }) {
  const query = useQuery({
    queryKey: ["mdata", "reverse", "default-drivers", operatingCompanyId, unitId],
    queryFn: () => listUnitDefaultDrivers(unitId, operatingCompanyId),
    enabled: Boolean(operatingCompanyId && unitId),
  });
  const rows = query.data?.drivers ?? [];
  return (
    <section className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid="unit-default-drivers-reverse">
      <h3 className="text-sm font-semibold text-slate-900">Default Drivers{rows.length ? ` (${rows.length})` : ""}</h3>
      {query.isLoading ? <p className="text-sm text-gray-500">Loading default drivers…</p> : null}
      {query.isError ? <p className="text-sm text-red-600">Could not load default drivers for this unit.</p> : null}
      {!query.isLoading && !query.isError && rows.length === 0 ? <p className="text-sm text-gray-500">No active default driver assigned to this unit.</p> : null}
      {rows.length ? <ul className="space-y-1">{rows.map((row) => (
        <li key={row.driver_id} className="text-sm text-slate-700">
          <EntityLinkOrTombstone kind="driver" id={row.driver_id} name={row.driver_name} noun="Driver" />
          <span className="text-xs text-gray-500"> · since {formatDateTimeUS(row.started_at)} · {row.source}</span>
        </li>
      ))}</ul> : null}
    </section>
  );
}
