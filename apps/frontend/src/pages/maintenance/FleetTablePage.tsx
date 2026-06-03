import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiRequest } from "../../api/client";
import { FleetTable, type FleetRow } from "../../components/FleetTable";

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
      apiRequest<{ rows: FleetRow[] }>(
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
  const counters = useMemo(() => {
    const sourceRows = rowsQuery.data?.rows ?? [];
    return {
      total: sourceRows.length,
      active: sourceRows.filter((r) => r.status === "InService").length,
      inShop: sourceRows.filter((r) => r.status === "InMaintenance").length,
      outOfService: sourceRows.filter((r) => r.status === "OutOfService").length,
    };
  }, [rowsQuery.data?.rows]);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Total Units" value={counters.total} />
        <KpiCard label="Active" value={counters.active} />
        <KpiCard label="In-Shop" value={counters.inShop} />
        <KpiCard label="Out-of-Service" value={counters.outOfService} />
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
        <FleetTable operatingCompanyId={operatingCompanyId} rows={rows} />
      )}
    </div>
  );
}
