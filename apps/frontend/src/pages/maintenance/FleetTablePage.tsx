import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiRequest } from "../../api/client";
import { FleetTable, type FleetRow, type SoftDeleteFilter } from "../../components/FleetTable";
import { FLEET_TYPE_FILTER_OPTIONS, parseFleetTypeFilter } from "../../components/fleet/fleetTypeFilter";

type Props = {
  operatingCompanyId: string;
  // /fleet home opts into active-only by default; Maintenance keeps showing all.
  defaultActiveOnly?: boolean;
};

type UnifiedUnitRow = FleetRow & {
  kind: "truck" | "trailer";
  type: string;
};

// Trucks/Trailers/Company sub-tabs (unit_class). "company" is the future company-vehicle
// class — empty for now (cars get their own class later), shown but with no rows yet.
const KIND_TABS: Array<{ key: string; label: string }> = [
  { key: "", label: "All" },
  { key: "truck", label: "Trucks" },
  { key: "trailer", label: "Trailers" },
  { key: "company", label: "Company Vehicles" },
];

function KpiCard({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: string | number;
  active?: boolean;
  onClick?: () => void;
}) {
  const cls = `rounded border px-2 py-1 text-left text-[11px] ${
    active ? "border-slate-500 bg-slate-50" : "border-gray-200 bg-white"
  }`;
  const inner = (
    <>
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="font-semibold">{value}</div>
    </>
  );
  if (!onClick) return <div className={cls}>{inner}</div>;
  return (
    <button type="button" onClick={onClick} aria-pressed={Boolean(active)} className={`${cls} hover:bg-gray-50`}>
      {inner}
    </button>
  );
}

function buildUnitsUrl(operatingCompanyId: string, typeFilter: string, includeInactive = false): string {
  const typeParam = typeFilter ? `&type=${encodeURIComponent(typeFilter)}` : "";
  const inactiveParam = includeInactive ? "&include_inactive=true" : "";
  return `/api/v1/mdata/units?include=trailers&operating_company_id=${encodeURIComponent(operatingCompanyId)}&limit=500${typeParam}${inactiveParam}`;
}

export function FleetTablePage({ operatingCompanyId, defaultActiveOnly = false }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const typeFilter = parseFleetTypeFilter(searchParams);
  const kindFilter = searchParams.get("kind") ?? "";
  const rawStatus = searchParams.get("status");
  // Absent status → default (active-only on /fleet, all in Maintenance). "all" → no status filter.
  const effectiveStatus = rawStatus == null ? (defaultActiveOnly ? "InService" : "") : rawStatus === "all" ? "" : rawStatus;
  const activeOnly = effectiveStatus === "InService";

  // Soft-delete (deactivated_at) dimension — independent of the 5 operational statuses.
  // Default Active. Inactive/All fetch with include_inactive=true so soft-deleted units
  // are visible and reactivatable.
  const [softDeleteFilter, setSoftDeleteFilter] = useState<SoftDeleteFilter>("active");
  const includeInactive = softDeleteFilter !== "active";

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
      const payload = await apiRequest<{ units: UnifiedUnitRow[]; total?: number }>(buildUnitsUrl(operatingCompanyId, ""));
      const rows = payload.units ?? [];
      return { rows, total: payload.total ?? rows.length };
    },
    enabled: Boolean(operatingCompanyId) && typeFilter !== "",
  });

  const rowsQuery = useQuery({
    queryKey: ["maintenance", "fleet-table", "rows", operatingCompanyId, typeFilter || "all", includeInactive ? "incl-inactive" : "active"],
    queryFn: async () => {
      const payload = await apiRequest<{ units: UnifiedUnitRow[]; total?: number }>(buildUnitsUrl(operatingCompanyId, typeFilter, includeInactive));
      const rows = payload.units ?? [];
      return { rows, total: payload.total ?? rows.length };
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
  const allRows = useMemo(() => (rowsQuery.data?.rows ?? []) as UnifiedUnitRow[], [rowsQuery.data?.rows]);

  // Client-side kind sub-tab + status (KPI/toggle) filtering on top of the server type filter.
  const rows = useMemo(
    () =>
      allRows.filter((r) => {
        if (kindFilter && r.kind !== kindFilter) return false;
        // Soft-delete dimension (deactivated_at), independent of operational status.
        if (softDeleteFilter === "active" && r.deactivated_at != null) return false;
        if (softDeleteFilter === "inactive" && r.deactivated_at == null) return false;
        // Operational status filter only narrows the default (Active) view; Inactive/All
        // show soft-deleted units of any operational status.
        if (softDeleteFilter === "active" && effectiveStatus && r.status !== effectiveStatus) return false;
        return true;
      }),
    [allRows, kindFilter, effectiveStatus, softDeleteFilter]
  );

  // Use the server's authoritative total (GO-LIVE Block 1A) so the count reflects the FULL fleet, not just
  // the fetched page — the unified/trailers endpoint previously returned no total, leaving "of 50".
  const totalVehicleCount =
    typeFilter !== "" ? (totalRowsQuery.data?.total ?? 0) : (rowsQuery.data?.total ?? allRows.length);
  const filteredCount = rows.length;
  const hasActiveFilter = typeFilter !== "" || kindFilter !== "" || effectiveStatus !== "";

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

  const patchParams = (mutate: (params: URLSearchParams) => void) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        mutate(params);
        return params;
      },
      { replace: true }
    );
  };

  const setTypeFilter = (nextType: string) =>
    patchParams((params) => (nextType ? params.set("type", nextType) : params.delete("type")));
  const setKind = (nextKind: string) =>
    patchParams((params) => (nextKind ? params.set("kind", nextKind) : params.delete("kind")));
  const setStatus = (nextStatus: string) => patchParams((params) => params.set("status", nextStatus));
  const clearFilters = () =>
    patchParams((params) => {
      params.delete("type");
      params.delete("kind");
      params.delete("status");
    });

  return (
    <div className="space-y-2">
      <div className="text-xs text-gray-700">
        Total Fleet: {counters.total} · Trucks: {counters.trucks} · Trailers: {counters.trailers}
      </div>

      {/* Sub-tabs: Trucks / Trailers / Company Vehicles (unit_class) */}
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Fleet sub-tabs">
        {KIND_TABS.map((tab) => (
          <button
            key={tab.key || "all"}
            type="button"
            role="tab"
            aria-selected={kindFilter === tab.key}
            onClick={() => setKind(tab.key)}
            className={`rounded border px-2 py-1 text-xs font-semibold ${
              kindFilter === tab.key ? "border-slate-500 bg-slate-50 text-slate-800" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Clickable KPIs — each filters the roster by status; Total clears the status filter. */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Total Units" value={counters.total} active={effectiveStatus === ""} onClick={() => setStatus("all")} />
        <KpiCard label="Active" value={counters.active} active={effectiveStatus === "InService"} onClick={() => setStatus("InService")} />
        <KpiCard label="In-Shop" value={counters.inShop} active={effectiveStatus === "InMaintenance"} onClick={() => setStatus("InMaintenance")} />
        <KpiCard
          label="Out-of-Service"
          value={counters.outOfService}
          active={effectiveStatus === "OutOfService"}
          onClick={() => setStatus("OutOfService")}
        />
        <KpiCard label="Avg Age" value={`${Number(kpis.avg_age_years ?? 0).toFixed(1)} y`} />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded border border-gray-200 bg-white px-2 py-1.5 text-xs">
        <label className="flex items-center gap-1 font-semibold text-gray-700">
          <input type="checkbox" checked={activeOnly} onChange={(e) => setStatus(e.target.checked ? "InService" : "all")} />
          Active only
        </label>
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
            {kindFilter === "company"
              ? "Company vehicles (cars/pickups) get their own class — none are tracked here yet."
              : hasActiveFilter
                ? "Try another type or clear filters to see all vehicles."
                : "Trucks and trailers appear here once assigned to this operating company."}
          </div>
        </div>
      ) : (
        <FleetTable
          operatingCompanyId={operatingCompanyId}
          rows={rows}
          softDeleteFilter={softDeleteFilter}
          onSoftDeleteFilterChange={setSoftDeleteFilter}
        />
      )}
    </div>
  );
}
