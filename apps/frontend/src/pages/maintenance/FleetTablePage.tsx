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

export function FleetTablePage({ operatingCompanyId }: Props) {
  const kpisQuery = useQuery({
    queryKey: ["maintenance", "fleet-table", "kpis", operatingCompanyId],
    queryFn: () =>
      apiRequest<{
        total_units: number;
        active_units: number;
        in_shop_units: number;
        out_of_service_units: number;
        avg_age_years: number;
      }>(`/api/v1/maintenance/fleet-table/kpis?operating_company_id=${encodeURIComponent(operatingCompanyId)}`),
    enabled: Boolean(operatingCompanyId),
  });
  const rowsQuery = useQuery({
    queryKey: ["maintenance", "fleet-table", "rows", operatingCompanyId],
    queryFn: () =>
      apiRequest<{ rows: Array<Record<string, unknown>> }>(
        `/api/v1/maintenance/fleet-table/rows?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
      ),
    enabled: Boolean(operatingCompanyId),
  });

  const kpis = kpisQuery.data ?? {
    total_units: 0,
    active_units: 0,
    in_shop_units: 0,
    out_of_service_units: 0,
    avg_age_years: 0,
  };
  const rows = rowsQuery.data?.rows ?? [];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Total Units" value={kpis.total_units} />
        <KpiCard label="Active" value={kpis.active_units} />
        <KpiCard label="In-Shop" value={kpis.in_shop_units} />
        <KpiCard label="Out-of-Service" value={kpis.out_of_service_units} />
        <KpiCard label="Avg Age" value={`${Number(kpis.avg_age_years ?? 0).toFixed(1)} y`} />
      </div>

      {rows.length === 0 ? (
        <div className="rounded border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-700">
          <div className="font-semibold">No fleet rows yet</div>
          <div className="mt-1 text-xs">Units appear here once they are assigned to this operating company.</div>
          <button type="button" className="mt-2 rounded border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-700">
            + Create
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded border border-gray-200 bg-white">
          <table className="w-full table-fixed text-left text-xs">
            <thead className="bg-gray-50 text-[10px] uppercase text-gray-600">
              <tr>
                <th className="px-2 py-1">Unit</th>
                <th className="px-2 py-1">VIN</th>
                <th className="px-2 py-1">Make/Model</th>
                <th className="px-2 py-1">Year</th>
                <th className="px-2 py-1">Status</th>
                <th className="px-2 py-1">DOT O/O</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={String(row.id)} className="border-t border-gray-100">
                  <td className="px-2 py-1">{String(row.unit_number ?? row.id ?? "—")}</td>
                  <td className="truncate px-2 py-1">{String(row.vin ?? "—")}</td>
                  <td className="truncate px-2 py-1">{`${String(row.make ?? "—")} ${String(row.model ?? "")}`.trim()}</td>
                  <td className="px-2 py-1">{String(row.year ?? "—")}</td>
                  <td className="px-2 py-1">{String(row.status ?? "—")}</td>
                  <td className="px-2 py-1">{row.is_oos ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
