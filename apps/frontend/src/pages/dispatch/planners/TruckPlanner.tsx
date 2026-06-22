import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { driverSchedulerOfficeApi } from "../../../api/driver-scheduler";
import { listUnitsWithoutLoad } from "../../../api/dispatch";
import { listUnits } from "../../../api/mdata";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { usePlannerRange } from "./PlannerRangeContext";

type TruckStatus = "assigned" | "available" | "reserved-hold" | "in-shop";

function truckStatusClass(status: TruckStatus): string {
  if (status === "assigned") return "bg-emerald-100 text-emerald-800";
  if (status === "available") return "bg-slate-100 text-slate-700";
  if (status === "reserved-hold") return "bg-amber-100 text-amber-800";
  return "bg-red-100 text-red-800";
}

function truckStatusLabel(status: TruckStatus): string {
  if (status === "assigned") return "asg";
  if (status === "available") return "avl";
  if (status === "reserved-hold") return "rsv";
  return "shop";
}

type TruckRow = {
  unitId: string;
  unitNumber: string;
  driverName: string | null;
  status: TruckStatus;
};

export function TruckPlanner() {
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const { range, days } = usePlannerRange();

  const gridQuery = useQuery({
    queryKey: ["driver-scheduler", "grid", operatingCompanyId, range.start, range.end],
    enabled: Boolean(operatingCompanyId),
    queryFn: () => driverSchedulerOfficeApi.getGrid(operatingCompanyId, range.start, range.end),
  });

  const unitsQuery = useQuery({
    queryKey: ["mdata", "units", operatingCompanyId],
    enabled: Boolean(operatingCompanyId),
    queryFn: () => listUnits({ operating_company_id: operatingCompanyId }),
  });

  const reservedQuery = useQuery({
    queryKey: ["dispatch", "units-without-load", operatingCompanyId],
    enabled: Boolean(operatingCompanyId),
    queryFn: () => listUnitsWithoutLoad(operatingCompanyId),
  });

  const truckRows = useMemo(() => {
    const rows = new Map<string, TruckRow>();
    const vacantIds = new Set((gridQuery.data?.vacant_units ?? []).map((u) => String(u.unit_id)));
    const reservedIds = new Set((reservedQuery.data?.units ?? []).map((u) => u.id));

    for (const dr of gridQuery.data?.drivers ?? []) {
      const unitId = dr.unit_id ? String(dr.unit_id) : "";
      const unitNumber = dr.unit_number ? String(dr.unit_number) : "";
      if (!unitId || !unitNumber) continue;
      rows.set(unitId, {
        unitId,
        unitNumber,
        driverName: dr.driver_name ? String(dr.driver_name) : null,
        status: "assigned",
      });
    }

    for (const u of gridQuery.data?.vacant_units ?? []) {
      const unitId = String(u.unit_id);
      const unitNumber = String(u.unit_number ?? unitId);
      if (rows.has(unitId)) continue;
      rows.set(unitId, {
        unitId,
        unitNumber,
        driverName: null,
        status: reservedIds.has(unitId) ? "reserved-hold" : "available",
      });
    }

    for (const raw of unitsQuery.data?.units ?? []) {
      const unit = raw as Record<string, unknown>;
      const unitId = String(unit.id ?? "");
      const unitNumber = String(unit.unit_number ?? unitId);
      if (!unitId) continue;
      const inShop = Boolean(unit.has_open_pm_due_wo) || Boolean(unit.is_dispatch_blocked);
      if (inShop) {
        const existing = rows.get(unitId);
        rows.set(unitId, {
          unitId,
          unitNumber,
          driverName: existing?.driverName ?? null,
          status: "in-shop",
        });
      } else if (!rows.has(unitId)) {
        rows.set(unitId, {
          unitId,
          unitNumber,
          driverName: null,
          status: vacantIds.has(unitId) ? "available" : "reserved-hold",
        });
      }
    }

    return [...rows.values()].sort((a, b) => a.unitNumber.localeCompare(b.unitNumber));
  }, [gridQuery.data, reservedQuery.data, unitsQuery.data]);

  const isLoading = gridQuery.isLoading || unitsQuery.isLoading || reservedQuery.isLoading;
  const isError = gridQuery.isError || unitsQuery.isError || reservedQuery.isError;

  return (
    <div data-testid="dispatch-truck-planner-page" className="space-y-2">
      {isLoading ? <div className="text-sm text-gray-500">Loading truck grid…</div> : null}
      {isError ? <div className="text-sm text-red-700">Failed to load truck planner grid.</div> : null}

      {!isLoading && !isError ? (
          <div className="max-w-[calc(100vw-48px)] overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="min-w-max border-collapse text-[10px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 border-b border-r bg-gray-50 px-2 py-1 text-left">Unit</th>
                <th className="border-b border-r bg-gray-50 px-1 py-1">Driver</th>
                {days.map((d) => (
                  <th key={d} className="border-b border-gray-100 px-0.5 py-1 text-center font-normal text-gray-500">
                    {d.slice(5)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {truckRows.map((row) => (
                <tr key={row.unitId} className="border-t border-gray-100">
                  <td className="sticky left-0 z-10 border-r bg-white px-2 py-0.5 text-xs font-medium text-gray-900">
                    <Link to={`/fleet/units/${row.unitId}`} className="text-slate-700 hover:underline">
                      {row.unitNumber}
                    </Link>
                  </td>
                  <td className="border-r px-1 py-0.5 text-gray-600">{row.driverName ?? "—"}</td>
                  {days.map((d) => (
                    <td key={d} className={`border-l border-gray-50 px-0 py-0 text-center ${truckStatusClass(row.status)}`} title={row.status}>
                      <span className="text-[9px]">{truckStatusLabel(row.status)}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
