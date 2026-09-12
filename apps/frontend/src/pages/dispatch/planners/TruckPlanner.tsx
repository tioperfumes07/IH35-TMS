import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { driverSchedulerOfficeApi } from "../../../api/driver-scheduler";
import { listUnitsWithoutLoad } from "../../../api/dispatch";
import { listAllUnits } from "../../../api/mdata";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { EntityLinkOrTombstone } from "../../../components/shared/EntityLinkOrTombstone";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { userFacingApiError } from "../../../lib/api-error-message";
import { isOperatorVisibleUnit } from "../../../lib/operator-fleet-visibility";
import { usePlannerRange } from "./PlannerRangeContext";
import { widenPlannerRange } from "./planner-range";
import { PlannerAxisHead } from "./PlannerAxisHead";
import { PlannerGrid } from "./PlannerGrid";
import { groupPlannerBarsByKey, usePlannerLoads } from "./planner-bars";
import { PlannerAction, PlannerActionDisabled } from "./PlannerRowActions";
import { PlannerViewToggle, type PlannerViewMode } from "./PlannerViewToggle";

void PlannerAxisHead;

type TruckStatus = "assigned" | "available" | "reserved-hold" | "in-shop";

// DISP-F6436: same enum set as FleetOosStrip.tsx's IN_SHOP_STATUSES -- kept as a literal duplicate
// (not imported) because FleetOosStrip.tsx is a dispatch-overview-only component; both must agree
// on which mdata.units.status values mean "in the shop", so any future addition there needs the
// identical addition here (enforced by verify-truck-planner-oos-signal-parity.mjs).
const IN_SHOP_UNIT_STATUSES = new Set(["InMaintenance", "OutOfService", "Damaged"]);
const PLANNER_UNIT_STATUSES = new Set(["InService", "InMaintenance", "OutOfService"]);

type TruckRow = {
  unitId: string;
  unitNumber: string;
  driverId: string | null;
  driverName: string | null;
  status: TruckStatus;
};

type TruckListRow = {
  unitId: string;
  unitNumber: string;
  driver: string;
  currentLoad: string;
  status: string;
  nextAvailable: string;
};

export function TruckPlanner() {
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const { range, days, setRange } = usePlannerRange();
  const [viewMode, setViewMode] = useState<PlannerViewMode>("grid");

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

  const loadsQuery = usePlannerLoads(operatingCompanyId, range.start, range.end);

  const truckRows = useMemo(() => {
    const rows = new Map<string, TruckRow>();

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
      // ROUND 20.6 K2 (owner-live 2026-09-12): this inverted `reservedIds` (from
      // listUnitsWithoutLoad -- an AVAILABILITY signal: "here are units with no active load") into a
      // RESERVATION signal. A vacant unit (no driver in the scheduler grid) that this OTHER endpoint
      // independently confirms has no active load is unambiguously available, not reserved -- there
      // is no genuine reservation/hold source wired into this component at all. Live-confirmed: 11
      // idle units with no driver, no load and nothing that reserved them were reading "Reserved".
      rows.set(unitId, {
        unitId,
        unitNumber,
        driverId: null,
        driverName: null,
        status: "available",
      });
    }

    for (const raw of unitsQuery.data?.units ?? []) {
      const unit = raw as Record<string, unknown>;
      const unitId = String(unit.id ?? "");
      const unitNumber = String(unit.unit_number ?? unitId);
      if (!unitId) continue;
      if (!isOperatorVisibleUnit({ unit_number: unitNumber, is_sample_data: unit.is_sample_data as boolean | null | undefined })) continue;
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
        // ROUND 20.6 K2 (owner-live 2026-09-12): this branch only runs for units NOT already found
        // in gridQuery's own drivers/vacant_units lists (that's what `!rows.has(unitId)` gates on) --
        // so `vacantIds.has(unitId)` here can never be true, and every one of these units silently
        // fell to "reserved-hold" ("Reserved" on screen) with no driver, no load, and nothing that
        // actually reserved them. There is no real reservation signal wired into this component at
        // all (reservedIds, above, comes from listUnitsWithoutLoad -- an AVAILABILITY signal, not a
        // reservation one). A unit the scheduler grid has no driver/vacant record for and that is
        // not in-shop is, honestly, just available.
        rows.set(unitId, {
          unitId,
          unitNumber,
          driverId: null,
          driverName: null,
          status: "available",
        });
      }
    }

    return [...rows.values()].sort((a, b) => a.unitNumber.localeCompare(b.unitNumber));
  }, [gridQuery.data, reservedQuery.data, unitsQuery.data]);

  // ROUND 20.6 K3 (owner-live 2026-09-12): "16 units render, the fleet is 31, 15 are missing with
  // no message saying why" -- the missing units are the ones PLANNER_UNIT_STATUSES / isOperatorVisibleUnit
  // filter out above (a status outside InService/InMaintenance/OutOfService, a test fixture, or a
  // sample-data row). That filtering is correct (this board is not a full fleet roster), but it was
  // silent. Name the gap instead of leaving it unexplained.
  const excludedUnitCount = useMemo(() => {
    let excluded = 0;
    for (const raw of unitsQuery.data?.units ?? []) {
      const unit = raw as Record<string, unknown>;
      const unitNumber = String(unit.unit_number ?? unit.id ?? "");
      if (!isOperatorVisibleUnit({ unit_number: unitNumber, is_sample_data: unit.is_sample_data as boolean | null | undefined })) {
        excluded += 1;
        continue;
      }
      if (!PLANNER_UNIT_STATUSES.has(String(unit.status ?? ""))) excluded += 1;
    }
    return excluded;
  }, [unitsQuery.data]);

  const isLoading = gridQuery.isLoading || unitsQuery.isLoading || reservedQuery.isLoading || loadsQuery.isLoading;
  const isError = gridQuery.isError || unitsQuery.isError || reservedQuery.isError || loadsQuery.isError;
  const firstError = gridQuery.error ?? unitsQuery.error ?? reservedQuery.error ?? loadsQuery.error;

  const loadBarsByUnit = useMemo(
    () => groupPlannerBarsByKey(loadsQuery.data ?? [], days, (l) => l.assigned_unit_id),
    [loadsQuery.data, days],
  );

  if (!operatingCompanyId) {
    return (
      <div
        data-testid="dispatch-truck-planner-need-company"
        className="rounded-sm border bg-white p-4 text-xs text-slate-600"
      >
        Select an operating company to load the truck planner.
      </div>
    );
  }

  return (
    <div data-testid="dispatch-truck-planner-page" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!isLoading && !isError && excludedUnitCount > 0 ? (
          <span className="text-xs text-slate-500" data-testid="dispatch-truck-planner-excluded-count">
            {excludedUnitCount} unit{excludedUnitCount === 1 ? "" : "s"} not shown (status outside In
            Service / In Maintenance / Out of Service, or a test fixture)
          </span>
        ) : (
          <span />
        )}
        <PlannerViewToggle viewMode={viewMode} onChange={setViewMode} />
      </div>
      {isLoading ? <div className="text-xs text-gray-500">Loading truck grid…</div> : null}
      {isError ? (
        <ListErrorBanner
          message={userFacingApiError(firstError, "Could not load truck planner grid")}
          onRetry={() => {
            void gridQuery.refetch();
            void unitsQuery.refetch();
            void reservedQuery.refetch();
            void loadsQuery.refetch();
          }}
        />
      ) : null}

      {!isLoading && !isError && viewMode === "list" ? (
        (() => {
          const listRows: TruckListRow[] = truckRows.map((row) => {
            const bars = loadBarsByUnit.get(row.unitId) ?? [];
            const statusLabel =
              row.status === "assigned" ? "In Use" :
              row.status === "available" ? "Available" :
              row.status === "in-shop" ? "In Shop" : "Reserved";
            return {
              unitId: row.unitId,
              unitNumber: row.unitNumber,
              driver: row.driverName ?? "—",
              currentLoad: bars.length > 0 ? bars[0].label : "—",
              status: statusLabel,
              nextAvailable: bars.length > 0 ? String(bars[0].endYmd) : "—",
            };
          });
          const columns: Array<ParityColumn<TruckListRow>> = [
            { key: "unitNumber", label: "Unit Number", sortable: true },
            { key: "driver", label: "Driver", sortable: true },
            { key: "currentLoad", label: "Current Load", sortable: true },
            { key: "status", label: "Status", sortable: true },
            { key: "nextAvailable", label: "Next Available", sortable: true },
          ];
          return (
            <div data-testid="dispatch-truck-planner-list">
              <ParityTable<TruckListRow>
                columns={columns}
                rows={listRows}
                rowKey={(row) => row.unitId}
                emptyText="No units for this company in the planner range."
                storageKey="dispatch-truck-planner-list"
                exportFilename="truck-planner"
              />
            </div>
          );
        })()
      ) : null}

      {!isLoading && !isError && viewMode === "grid" ? (
        <PlannerGrid
          days={days}
          frozenLabel="Unit"
          frozenPx={320}
          statusLabel="Status"
          actionLabel="Action"
          onExpandRange={(minYmd, maxYmd) => setRange(widenPlannerRange(range, minYmd, maxYmd))}
          rows={truckRows
            .filter((row) => row.status !== "in-shop")
            .map((row) => {
              const status = row.status === "assigned" ? "In Use" : row.status === "available" ? "Available" : "Reserved";
              return {
              id: row.unitId,
              idle: row.status === "available",
              name: <EntityLinkOrTombstone kind="unit" id={row.unitId} name={row.unitNumber} noun="Unit" />,
              // Planners lists, item 3 — plain-text keys for the sortable frozen columns.
              sortKey: row.unitNumber,
              statusSortKey: status,
              unit: row.driverName ? (
                <EntityLinkOrTombstone kind="driver" id={row.driverId} name={row.driverName} noun="Driver" />
              ) : null,
              status,
              action: (
                <PlannerAction to={`/dispatch/loads?unit_id=${encodeURIComponent(row.unitId)}`} label="Book" />
              ),
              bars: loadBarsByUnit.get(row.unitId) ?? [],
              };
            })}
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
      {!isLoading && !isError && viewMode === "grid" && truckRows.some((row) => row.status === "in-shop") ? (
        <div className="mt-3">
          <PlannerGrid
            days={days}
            frozenLabel="In shop"
            frozenPx={320}
            statusLabel="Status"
            actionLabel="Action"
            rows={truckRows
              .filter((row) => row.status === "in-shop")
              .map((row) => ({
                id: `shop-${row.unitId}`,
                idle: true,
                name: <EntityLinkOrTombstone kind="unit" id={row.unitId} name={row.unitNumber} noun="Unit" />,
                sortKey: row.unitNumber,
                statusSortKey: "In Shop",
                unit: row.driverName ? (
                  <EntityLinkOrTombstone kind="driver" id={row.driverId} name={row.driverName} noun="Driver" />
                ) : null,
                status: "In Shop",
                action: (
                  <PlannerActionDisabled label="Book" title="Cannot book a load onto a unit that is in the shop" />
                ),
                bars: loadBarsByUnit.get(row.unitId) ?? [],
              }))}
            empty={null}
          />
        </div>
      ) : null}
    </div>
  );
}
