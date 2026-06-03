import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { apiRequest } from "../../api/client";
import { FleetTable, type FleetRow } from "../../components/FleetTable";
import { FLEET_TYPE_FILTER_OPTIONS, parseFleetTypeFilter } from "../../components/fleet/fleetTypeFilter";

type Props = {
  operatingCompanyId: string;
};

type UnifiedUnitRow = FleetRow & {
  kind: "truck" | "trailer";
  type: string;
};

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-gray-200 bg-white px-2 py-1 text-[11px]">
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

function buildUnitsUrl(operatingCompanyId: string, typeFilter: string): string {
  const typeParam = typeFilter ? `&type=${encodeURIComponent(typeFilter)}` : "";
  return `/api/v1/mdata/units?include=trailers&operating_company_id=${encodeURIComponent(operatingCompanyId)}&limit=500${typeParam}`;
}

export function FleetTablePage({ operatingCompanyId }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const typeFilter = parseFleetTypeFilter(searchParams);

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

  const totalRowsQuery = useQuery({
    queryKey: ["maintenance", "fleet-table", "rows", operatingCompanyId, "all"],
    queryFn: async () => {
      const payload = await apiRequest<{ units: UnifiedUnitRow[] }>(buildUnitsUrl(operatingCompanyId, ""));
      return { rows: payload.units ?? [] };
    },
    enabled: Boolean(operatingCompanyId) && typeFilter !== "",
  });

  const rowsQuery = useQuery({
    queryKey: ["maintenance", "fleet-table", "rows", operatingCompanyId, typeFilter || "all"],
    queryFn: async () => {
      const payload = await apiRequest<{ units: UnifiedUnitRow[] }>(buildUnitsUrl(operatingCompanyId, typeFilter));
      return { rows: payload.units ?? [] };
    },
    enabled: Boolean(operatingCompanyId),
  });

  const kpis = kpisQuery.data ?? {
    total_units: 0,
    active_units: 0,
    in_shop_units: 0,
    out_of_service_units: 0,
    avg_age_years: 0,
  };
  const rows: FleetRow[] = rowsQuery.data?.rows ?? [];
  const totalVehicleCount =
    typeFilter !== "" ? (totalRowsQuery.data?.rows.length ?? 0) : (rowsQuery.data?.rows.length ?? 0);
  const filteredCount = rows.length;
  const hasActiveFilter = typeFilter !== "";

  const counters = useMemo(() => {
    const sourceRows = rowsQuery.data?.rows ?? [];
    const trucks = sourceRows.filter((r) => r.kind === "truck");
    const trailers = sourceRows.filter((r) => r.kind === "trailer");
    return {
      total: sourceRows.length,
      trucks: trucks.length,
      trailers: trailers.length,
      active: sourceRows.filter((r) => r.status === "InService").length,
      inShop: sourceRows.filter((r) => r.status === "InMaintenance").length,
      outOfService: sourceRows.filter((r) => r.status === "OutOfService").length,
    };
  }, [rowsQuery.data?.rows]);

  const setTypeFilter = (nextType: string) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (!nextType) params.delete("type");
        else params.set("type", nextType);
        return params;
      },
      { replace: true }
    );
  };

  const clearFilters = () => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.delete("type");
        return params;
      },
      { replace: true }
    );
  };

  return (
    <div className="space-y-2">
      <div className="text-xs text-gray-700">
        Total Fleet: {counters.total} · Trucks: {counters.trucks} · Trailers: {counters.trailers}
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Total Units" value={counters.total} />
        <KpiCard label="Active" value={counters.active} />
        <KpiCard label="In-Shop" value={counters.inShop} />
        <KpiCard label="Out-of-Service" value={counters.outOfService} />
        <KpiCard label="Avg Age" value={`${Number(kpis.avg_age_years ?? 0).toFixed(1)} y`} />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded border border-gray-200 bg-white px-2 py-1.5 text-xs">
        <label htmlFor="fleet-type-filter" className="font-semibold text-gray-700">
          Type
        </label>
        <select
          id="fleet-type-filter"
          aria-label="Filter fleet by type"
          className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value)}
        >
          {FLEET_TYPE_FILTER_OPTIONS.map((option) => (
            <option key={option.label} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="text-gray-600">
          Showing {filteredCount} of {totalVehicleCount} vehicles
        </span>
        {hasActiveFilter ? (
          <button
            type="button"
            className="rounded border border-gray-300 bg-white px-2 py-0.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            onClick={clearFilters}
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <div className="rounded border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-700">
          <div className="font-semibold">{hasActiveFilter ? "No fleet rows match this filter" : "No fleet rows yet"}</div>
          <div className="mt-1 text-xs">
            {hasActiveFilter
              ? "Try another type or clear filters to see all vehicles."
              : "Trucks and trailers appear here once assigned to this operating company."}
          </div>
        </div>
      ) : (
        <FleetTable operatingCompanyId={operatingCompanyId} rows={rows} />
      )}
    </div>
  );
}
