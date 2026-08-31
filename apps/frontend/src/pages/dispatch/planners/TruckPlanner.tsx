import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { driverSchedulerOfficeApi } from "../../../api/driver-scheduler";
import { listUnitsWithoutLoad } from "../../../api/dispatch";
import { listAllUnits } from "../../../api/mdata";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { EntityLinkOrTombstone } from "../../../components/shared/EntityLinkOrTombstone";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { userFacingApiError } from "../../../lib/api-error-message";
import { usePlannerRange } from "./PlannerRangeContext";
import { PlannerAxisHead } from "./PlannerAxisHead";
import { PlannerGrid } from "./PlannerGrid";

void PlannerAxisHead;

type TruckStatus = "assigned" | "available" | "reserved-hold" | "in-shop";

// DISP-F6436: same enum set as FleetOosStrip.tsx's IN_SHOP_STATUSES -- kept as a literal duplicate
// (not imported) because FleetOosStrip.tsx is a dispatch-overview-only component; both must agree
// on which mdata.units.status values mean "in the shop", so any future addition there needs the
// identical addition here (enforced by verify-truck-planner-oos-signal-parity.mjs).
const IN_SHOP_UNIT_STATUSES = new Set(["InMaintenance", "OutOfService", "Damaged"]);
const PLANNER_UNIT_STATUSES = new Set(["InService", "InMaintenance", "OutOfService"]);

function truckStatusClass(status: TruckStatus): string {
  if (status === "assigned") return "bg-slate-100 text-slate-700";
  if (status === "available") return "bg-slate-100 text-slate-700";
  if (status === "reserved-hold") return "bg-slate-100 text-slate-700";
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
  driverId: string | null;
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
    queryFn: () => listAllUnits({ operating_company_id: operatingCompanyId }),
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
        driverId: dr.driver_id ? String(dr.driver_id) : null,
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
        driverId: null,
        driverName: null,
        status: reservedIds.has(unitId) ? "reserved-hold" : "available",
      });
    }

    for (const raw of unitsQuery.data?.units ?? []) {
      const unit = raw as Record<string, unknown>;
      const unitId = String(unit.id ?? "");
      const unitNumber = String(unit.unit_number ?? unitId);
      if (!unitId) continue;
      if (!PLANNER_UNIT_STATUSES.has(String(unit.status ?? ""))) continue;
      // DISP-F6436: this used to check only 2 of the 4 OOS signals the sibling FleetOosStrip.tsx
      // (Dispatch Overview/Kanban "FLEET OOS / IN SHOP" strip) already checks against the same
      // listUnits() row shape -- is_oos and the raw status enum were missing. Live-confirmed: all
      // 14 units in FleetOosStrip's OOS list (unit.is_oos=true, no open PM/dispatch-block flag)
      // rendered "avl" every day in this grid -- a dispatcher could book a load onto a truck
      // that's parked in the shop. Mirror FleetOosStrip's exact predicate so the two surfaces never
      // disagree about which units are out of service.
      const inShop =
        Boolean(unit.has_open_pm_due_wo) ||
        Boolean(unit.is_dispatch_blocked) ||
        Boolean(unit.is_oos) ||
        (unit.status != null && IN_SHOP_UNIT_STATUSES.has(String(unit.status)));
      if (inShop) {
        const existing = rows.get(unitId);
        rows.set(unitId, {
          unitId,
          unitNumber,
          driverId: existing?.driverId ?? null,
          driverName: existing?.driverName ?? null,
          status: "in-shop",
        });
      } else if (!rows.has(unitId)) {
        rows.set(unitId, {
          unitId,
          unitNumber,
          driverId: null,
          driverName: null,
          status: vacantIds.has(unitId) ? "available" : "reserved-hold",
        });
      }
    }

    return [...rows.values()].sort((a, b) => a.unitNumber.localeCompare(b.unitNumber));
  }, [gridQuery.data, reservedQuery.data, unitsQuery.data]);

  const isLoading = gridQuery.isLoading || unitsQuery.isLoading || reservedQuery.isLoading;
  const isError = gridQuery.isError || unitsQuery.isError || reservedQuery.isError;
  const firstError = gridQuery.error ?? unitsQuery.error ?? reservedQuery.error;

  if (!operatingCompanyId) {
    return (
      <div
        data-testid="dispatch-truck-planner-need-company"
        className="rounded-sm border bg-white p-4 text-sm text-slate-600"
      >
        Select an operating company to load the truck planner.
      </div>
    );
  }

  return (
    <div data-testid="dispatch-truck-planner-page" className="space-y-2">
      {isLoading ? <div className="text-sm text-gray-500">Loading truck grid…</div> : null}
      {isError ? (
        <ListErrorBanner
          message={userFacingApiError(firstError, "Could not load truck planner grid")}
          onRetry={() => {
            void gridQuery.refetch();
            void unitsQuery.refetch();
            void reservedQuery.refetch();
          }}
        />
      ) : null}

      {!isLoading && !isError ? (
        <PlannerGrid
          days={days}
          frozenLabel="Unit"
          frozenPx={320}
          rows={truckRows
            .filter((row) => row.status !== "in-shop")
            .map((row) => ({
              id: row.unitId,
              idle: row.status === "available",
              name: <EntityLinkOrTombstone kind="unit" id={row.unitId} name={row.unitNumber} noun="Unit" />,
              secondary: (
                <span className={`rounded-sm px-1 text-[9px] ${truckStatusClass(row.status)}`}>
                  {truckStatusLabel(row.status)}
                </span>
              ),
              unit: row.driverName ? (
                <EntityLinkOrTombstone kind="driver" id={row.driverId} name={row.driverName} noun="Driver" />
              ) : null,
              bars: [],
            }))}
          empty={
            truckRows.length === 0 ? (
            <span data-testid="dispatch-truck-planner-honest-empty">
              No units for this company in the planner range. Units leased/owned under Fleet appear here once listUnits
              / scheduler grid return rows for the active entity.
            </span>
            ) : null
          }
        />
      ) : null}
      {!isLoading && !isError && truckRows.some((row) => row.status === "in-shop") ? (
        <div className="mt-3">
          <PlannerGrid
            days={days}
            frozenLabel="In shop"
            frozenPx={320}
            rows={truckRows
              .filter((row) => row.status === "in-shop")
              .map((row) => ({
                id: `shop-${row.unitId}`,
                idle: true,
                name: <EntityLinkOrTombstone kind="unit" id={row.unitId} name={row.unitNumber} noun="Unit" />,
                secondary: (
                  <span className={`rounded-sm px-1 text-[9px] ${truckStatusClass(row.status)}`}>
                    {truckStatusLabel(row.status)}
                  </span>
                ),
                unit: row.driverName ? (
                  <EntityLinkOrTombstone kind="driver" id={row.driverId} name={row.driverName} noun="Driver" />
                ) : null,
                bars: [],
              }))}
            empty={null}
          />
        </div>
      ) : null}
    </div>
  );
}
