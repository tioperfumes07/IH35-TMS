import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";

type Props = {
  operatingCompanyId: string;
};

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-gray-200 bg-white px-2 py-1 text-[11px]">
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

export function ServiceLocationPage({ operatingCompanyId }: Props) {
  const kpisQuery = useQuery({
    queryKey: ["maintenance", "service-location", "kpis", operatingCompanyId],
    queryFn: () =>
      apiRequest<{
        in_house_count: number;
        external_count: number;
        roadside_count: number;
        unique_locations: number;
      }>(`/api/v1/maintenance/service-location/kpis?operating_company_id=${encodeURIComponent(operatingCompanyId)}`),
    enabled: Boolean(operatingCompanyId),
  });
  const rowsQuery = useQuery({
    queryKey: ["maintenance", "service-location", "rows", operatingCompanyId],
    queryFn: () =>
      apiRequest<{ rows: Array<Record<string, unknown>> }>(
        `/api/v1/maintenance/service-location/rows?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
      ),
    enabled: Boolean(operatingCompanyId),
  });

  const kpis = kpisQuery.data ?? { in_house_count: 0, external_count: 0, roadside_count: 0, unique_locations: 0 };
  const rows = rowsQuery.data?.rows ?? [];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <KpiCard label="In-House" value={kpis.in_house_count} />
        <KpiCard label="External" value={kpis.external_count} />
        <KpiCard label="Roadside" value={kpis.roadside_count} />
        <KpiCard label="Locations" value={kpis.unique_locations} />
      </div>

      {rows.length === 0 ? (
        <div className="rounded border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-700">
          <div className="font-semibold">No service-location rows yet</div>
          <div className="mt-1 text-xs">Active work orders grouped by service location will render here.</div>
          <button type="button" className="mt-2 rounded border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-700">
            + Create
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded border border-gray-200 bg-white">
          <table className="w-full table-fixed text-left text-xs">
            <thead className="bg-gray-50 text-[10px] uppercase text-gray-600">
              <tr>
                <th className="px-2 py-1">Service Location</th>
                <th className="px-2 py-1">Bucket</th>
                <th className="px-2 py-1">Open Work Orders</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${String(row.service_location)}-${String(row.bucket)}-${index}`} className="border-t border-gray-100">
                  <td className="px-2 py-1">{String(row.service_location ?? "unspecified")}</td>
                  <td className="px-2 py-1">{String(row.bucket ?? "in_house")}</td>
                  <td className="px-2 py-1">{Number(row.open_work_orders ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
