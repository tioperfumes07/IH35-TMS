import { useQuery } from "@tanstack/react-query";
import { EntityLink } from "../shared/EntityLink";
import { apiRequest } from "../../api/client";
import { formatDateUS } from "../../lib/formatDate";
import { ListErrorBanner } from "../shared/ListErrorBanner";

type Crossing = { id: string; planned_crossing_date: string | null; crossing_date: string; port_of_entry: string; direction: string };

export function UnitBorderCrossingsReverseSection({ operatingCompanyId, unitId }: { operatingCompanyId: string; unitId: string }) {
  const query = useQuery({
    queryKey: ["border-crossing", "history", "unit", operatingCompanyId, unitId],
    queryFn: () => {
      const params = new URLSearchParams({ operating_company_id: operatingCompanyId, unit_id: unitId });
      return apiRequest<{ crossings: Crossing[] }>(`/api/v1/border-crossing/history?${params.toString()}`);
    },
    enabled: Boolean(operatingCompanyId && unitId),
  });
  const rows = query.isError ? [] : (query.data?.crossings ?? []);
  return (
    <section className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid="vehicle-profile-border-crossings">
      <h2 className="text-sm font-semibold text-slate-900">Border crossings{rows.length ? ` (${rows.length})` : ""}</h2>
      {query.isError ? <ListErrorBanner message="Couldn't load border crossings for this unit." onRetry={() => void query.refetch()} /> : null}
      {query.isLoading ? <p className="text-sm text-gray-500">Loading…</p> : null}
      {!query.isLoading && !query.isError && rows.length === 0 ? <p className="text-sm text-gray-500">No completed border crossings linked to this unit.</p> : null}
      {rows.map((row) => (
        <div key={row.id} className="px-2 py-1.5 text-sm">
          <EntityLink kind="border_crossing" id={row.id} label={row.port_of_entry} className="font-semibold text-slate-700 underline" />
          <span className="ml-2 text-xs text-gray-600">{row.direction} · {formatDateUS(row.planned_crossing_date ?? row.crossing_date)}</span>
        </div>
      ))}
    </section>
  );
}
