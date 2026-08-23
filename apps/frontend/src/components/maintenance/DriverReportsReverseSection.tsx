import { useQuery } from "@tanstack/react-query";
import { EntityLink } from "../shared/EntityLink";
import { listDriverReports } from "../../api/maintenance";
import { formatDateTimeUS } from "../../lib/formatDate";

export function DriverReportsReverseSection({ operatingCompanyId, driverId }: { operatingCompanyId: string; driverId: string }) {
  const query = useQuery({
    queryKey: ["maintenance", "reverse", "driver-reports", operatingCompanyId, driverId],
    queryFn: () => listDriverReports({ operating_company_id: operatingCompanyId, driver_id: driverId, limit: 5 }),
    enabled: Boolean(operatingCompanyId && driverId),
  });
  const rows = query.data?.rows ?? [];
  const totalCount = query.data?.total_count ?? rows.length;
  return (
    <section className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid="driver-reports-reverse">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Driver Reports{totalCount ? ` (${totalCount})` : ""}</h3>
        <EntityLink kind="driver_reports_driver" id={driverId} label="Open report queue" className="text-xs font-semibold text-slate-700 underline" />
      </div>
      {query.isLoading ? <p className="text-sm text-gray-500">Loading driver reports…</p> : null}
      {query.isError ? <p className="text-sm text-red-600">Could not load reports for this driver.</p> : null}
      {!query.isLoading && !query.isError && rows.length === 0 ? <p className="text-sm text-gray-500">No reports submitted by this driver.</p> : null}
      {totalCount > rows.length ? <p className="text-xs text-slate-500">Showing {rows.length} of {totalCount}. Open report queue to view all.</p> : null}
      {rows.length > 0 ? (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="rounded-sm border border-gray-200 px-2 py-1.5 text-sm">
              <EntityLink
                kind="driver_report"
                id={row.id}
                label={row.report_type}
                className="font-semibold text-slate-700 underline"
              />
              <span className="ml-2 text-gray-500">{row.status} · {formatDateTimeUS(row.reported_at)}</span>
              <p className="text-xs text-gray-600">{row.description}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
