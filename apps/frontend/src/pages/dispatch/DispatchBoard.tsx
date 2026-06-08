import { Fragment, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DispatchLoadRow } from "../../api/loads";
import { listUnitsWithoutLoad, listActiveLoadTriSignals, type TriSignalRow, type UnitsWithoutLoad } from "../../api/dispatch";
import type { DispatchListProps } from "../../components/dispatch/DispatchList";
import {
  BulkActionBar,
  BulkActionModal,
  BulkProgressDialog,
  TableSelection,
  TableSelectionHeader,
  useBulkSelection,
} from "../../components/bulk";
import { useEntityBulkAction } from "../../components/bulk/useEntityBulkAction";
import { Button } from "../../components/Button";
import { ListErrorState } from "../../components/ListErrorState";
import { useToast } from "../../components/Toast";
import { addLoadToPreSettlement, listOpenPreSettlements, type OpenPreSettlement } from "../../api/driverFinance";
import { FLAG_EMOJI_BY_CODE, STATUS_LABEL, formatMoneyCents, toRouteSummary } from "../../components/dispatch/constants";
import { InTransitEtaChip } from "../../components/dispatch/InTransitEtaChip";
import { InlineDriverPicker } from "../../components/dispatch/InlineDriverPicker";
import { InlineUnitPicker } from "../../components/dispatch/InlineUnitPicker";
import { OnTimePredictionColumn } from "../../components/dispatch/LiveEtaColumns";
import { CargoTempBadge, isReeferCommodity } from "../../components/dispatch/CargoTempBadge";
import { LoadLivePositionCell } from "../../components/dispatch/LoadLivePositionCell";
import { TriSignalPill } from "../../components/dispatch/TriSignalPill";

export type DispatchBoardProps = Omit<DispatchListProps, "showEtaColumn"> & {
  operatingCompanyId?: string;
  onBulkComplete?: () => void;
};

type BoardMode = "list" | "table" | "assignment";

type BoardLoadExtras = {
  customer_wo_number?: string | null;
  commodity?: string | null;
  linehaul_cents?: number | null;
  trailer_number?: string | null;
};

type BoardLoad = DispatchLoadRow & BoardLoadExtras;

type RowOverride = {
  unitId?: string | null;
  unitLabel?: string;
  driverId?: string | null;
  driverLabel?: string;
};

const LOAD_TRANSITION_OPTIONS = [
  { value: "dispatched", label: "Mark dispatched" },
  { value: "in_transit", label: "Mark in transit" },
  { value: "delivered_pending_docs", label: "Mark delivered (pending docs)" },
  { value: "completed_docs_received", label: "Mark docs received" },
  { value: "cancelled", label: "Cancel load" },
] as const;

const BOARD_MODES: Array<{ id: BoardMode; label: string; testId: string }> = [
  { id: "list", label: "List", testId: "dispatch-board-mode-list" },
  { id: "table", label: "Table", testId: "dispatch-board-mode-table" },
  { id: "assignment", label: "Assignment", testId: "dispatch-board-mode-assignment" },
];

function parseBoardMode(raw: string | null): BoardMode {
  if (raw === "table" || raw === "assignment") return raw;
  return "list";
}

function persistBoardMode(mode: BoardMode) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (mode === "list") url.searchParams.delete("board");
  else url.searchParams.set("board", mode);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function readBoardModeFromLocation(): BoardMode {
  if (typeof window === "undefined") return "list";
  return parseBoardMode(new URLSearchParams(window.location.search).get("board"));
}

function readBoardLoad(load: DispatchLoadRow): BoardLoad {
  return load as BoardLoad;
}

function laneSummary(load: DispatchLoadRow) {
  return toRouteSummary(load.first_pickup_city, load.first_delivery_city);
}

function isUnassignedLoad(load: DispatchLoadRow) {
  return !load.assigned_unit_id;
}

function isBookedReserved(load: DispatchLoadRow) {
  if (load.assigned_unit_id || load.assigned_primary_driver_id) return false;
  return ["draft", "booked", "planned"].includes(load.status);
}

function isAssignedLoad(load: DispatchLoadRow) {
  return Boolean(load.assigned_unit_id);
}

function sortUnassignedFirst(loads: DispatchLoadRow[]) {
  return [...loads].sort((a, b) => {
    const aRank = isUnassignedLoad(a) ? 0 : 1;
    const bRank = isUnassignedLoad(b) ? 0 : 1;
    if (aRank !== bRank) return aRank - bRank;
    return 0;
  });
}

function statusVariant(status: DispatchLoadRow["status"]) {
  if (status === "cancelled") return "bg-red-100 text-red-700";
  if (status === "delivered") return "bg-emerald-100 text-emerald-700";
  if (status === "in_transit" || status === "at_pickup" || status === "at_delivery") return "bg-blue-100 text-blue-700";
  if (status === "closed" || status === "paid" || status === "invoiced") return "bg-gray-200 text-gray-700";
  return "bg-amber-100 text-amber-700";
}

function riskTierClass(load: DispatchLoadRow) {
  if (load.on_time_prediction === "green") return "bg-emerald-100 text-emerald-800";
  if (load.on_time_prediction === "amber") return "bg-amber-100 text-amber-800";
  if (load.on_time_prediction === "red") return "bg-red-100 text-red-800";
  if (load.progress_status === "early" || load.progress_status === "on_track") return "bg-emerald-100 text-emerald-800";
  if (load.progress_status === "behind") return "bg-amber-100 text-amber-800";
  if (load.progress_status === "delayed") return "bg-red-100 text-red-800";
  return "bg-gray-100 text-gray-600";
}

function riskTierLabel(load: DispatchLoadRow) {
  if (load.on_time_prediction === "green") return "On time";
  if (load.on_time_prediction === "amber") return "At risk";
  if (load.on_time_prediction === "red") return "Late";
  if (load.progress_status === "early") return "Early";
  if (load.progress_status === "on_track") return "On time";
  if (load.progress_status === "behind") return "Behind";
  if (load.progress_status === "delayed") return "Delayed";
  return "Unknown";
}

function isAtRiskOfLate(load: DispatchLoadRow) {
  return (
    load.on_time_prediction === "amber" ||
    load.on_time_prediction === "red" ||
    load.progress_status === "behind" ||
    load.progress_status === "delayed"
  );
}

function linehaulCents(load: BoardLoad) {
  if (typeof load.linehaul_cents === "number" && load.linehaul_cents > 0) return load.linehaul_cents;
  return load.rate_total_cents;
}

function DocComplianceCell({ load }: { load: DispatchLoadRow }) {
  const ready = load.geofence_ready;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ready ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}
      title={ready ? "Pre-dispatch doc gate passed" : "Doc compliance pending"}
    >
      {ready ? "Ready" : "Pending"}
    </span>
  );
}

function RiskCell({ load }: { load: DispatchLoadRow }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${riskTierClass(load)}`}>
        {isAtRiskOfLate(load) ? "⚠ " : ""}
        {riskTierLabel(load)}
      </span>
      <OnTimePredictionColumn load={load} />
      {load.status === "in_transit" ? (
        <InTransitEtaChip loadId={load.id} operatingCompanyId={load.operating_company_id} />
      ) : null}
    </div>
  );
}

function AssignmentBand({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="space-y-1" data-testid={`dispatch-assignment-band-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex items-center justify-between border-b border-gray-200 pb-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-700">{title}</h3>
        <span className="text-[11px] text-gray-500">{count}</span>
      </div>
      {children}
    </section>
  );
}

export function DispatchBoard({
  operatingCompanyId,
  onBulkComplete,
  loads,
  onExportCsv,
  totalCount,
  limit,
  offset,
  loading,
  listError,
  activeGeofenceBreachVehicleIds,
  onRowClick,
  onPageChange,
}: DispatchBoardProps) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [boardMode, setBoardModeState] = useState<BoardMode>(readBoardModeFromLocation);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [pendingTransition, setPendingTransition] = useState<string>(LOAD_TRANSITION_OPTIONS[0].value);
  const [rowOverrides, setRowOverrides] = useState<Record<string, RowOverride>>({});
  const bulk = useEntityBulkAction();
  const selection = useBulkSelection({
    cap: 200,
    onCapExceeded: (error) => pushToast(error.message, "error"),
  });

  const pageRowIds = useMemo(() => loads.map((load) => load.id), [loads]);

  const companyId = operatingCompanyId ?? loads[0]?.operating_company_id ?? "";
  const inlineQuicksaveEnabled = true;

  const openPreSettlementsQuery = useQuery({
    queryKey: ["pre-settlements-open", companyId],
    queryFn: () => listOpenPreSettlements(companyId),
    enabled: Boolean(companyId),
    staleTime: 30_000,
  });

  const unitsWithoutLoadQuery = useQuery({
    queryKey: ["dispatch-board", "units-without-load", companyId],
    queryFn: () => listUnitsWithoutLoad(companyId),
    enabled: Boolean(companyId) && boardMode === "assignment",
    staleTime: 30_000,
  });

  const triSignalsQuery = useQuery({
    queryKey: ["dispatch-board", "tri-signals", companyId],
    queryFn: () => listActiveLoadTriSignals(companyId),
    enabled: Boolean(companyId),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const triSignalByLoadId = useMemo(() => {
    const map = new Map<string, TriSignalRow>();
    for (const row of triSignalsQuery.data?.signals ?? []) {
      map.set(row.load_uuid, row);
    }
    return map;
  }, [triSignalsQuery.data]);

  const openPreSettlementsMap = useMemo<Map<string, OpenPreSettlement>>(() => {
    const map = new Map<string, OpenPreSettlement>();
    for (const ps of openPreSettlementsQuery.data?.pre_settlements ?? []) {
      if (ps.driver_id) map.set(ps.driver_id, ps);
    }
    return map;
  }, [openPreSettlementsQuery.data]);

  const effectiveLoads = useMemo(
    () =>
      loads.map((load) => {
        const override = rowOverrides[load.id];
        if (!override) return load;
        return {
          ...load,
          assigned_unit_id: override.unitId !== undefined ? override.unitId : load.assigned_unit_id,
          assigned_unit_number: override.unitLabel ?? load.assigned_unit_number,
          assigned_primary_driver_id:
            override.driverId !== undefined ? override.driverId : load.assigned_primary_driver_id,
          assigned_primary_driver_name: override.driverLabel ?? load.assigned_primary_driver_name,
        };
      }),
    [loads, rowOverrides]
  );

  const sortedLoads = useMemo(() => sortUnassignedFirst(effectiveLoads), [effectiveLoads]);

  const bookedLoads = useMemo(() => sortedLoads.filter(isBookedReserved), [sortedLoads]);
  const assignedLoads = useMemo(() => sortedLoads.filter(isAssignedLoad), [sortedLoads]);
  const unassignedUnits = unitsWithoutLoadQuery.data?.units ?? [];

  const from = totalCount === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, totalCount);
  const hasPrev = offset > 0;
  const hasNext = offset + limit < totalCount;

  const setBoardMode = (mode: BoardMode) => {
    setBoardModeState(mode);
    persistBoardMode(mode);
  };

  const addLoadMutation = useMutation({
    mutationFn: ({ settlementId, loadId, ocId }: { settlementId: string; loadId: string; ocId: string }) =>
      addLoadToPreSettlement(settlementId, { operating_company_id: ocId, load_id: loadId }),
    onSuccess: () => {
      pushToast("Load linked to pre-settlement", "success");
      void openPreSettlementsQuery.refetch();
      void queryClient.invalidateQueries({ queryKey: ["pre-settlements-open"] });
    },
    onError: (err) => {
      pushToast(err instanceof Error ? err.message : "Failed to link load to pre-settlement", "error");
    },
  });

  const exportSelectedCsv = () => {
    const selected = sortedLoads.filter((load) => selection.selectedIds.has(load.id));
    const headers = ["load_number", "customer_name", "lane", "unit", "driver", "risk", "status"];
    const bodyRows = selected.map((load) =>
      [
        load.load_number,
        load.customer_name ?? "",
        laneSummary(load),
        load.assigned_unit_number ?? "",
        load.assigned_primary_driver_name ?? "",
        riskTierLabel(load),
        load.status,
      ].map((item) => `"${String(item).replace(/"/g, '""')}"`)
    );
    const csv = [headers.join(","), ...bodyRows.map((row) => row.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `dispatch-loads-selected-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const runStatusBulk = async (reason?: string) => {
    if (!companyId) {
      pushToast("Select an operating company before bulk updates.", "error");
      return;
    }
    const ids = Array.from(selection.selectedIds);
    setStatusModalOpen(false);
    try {
      await bulk.runBulk(
        {
          domain: "dispatch",
          resource: "loads",
          ids,
          action: "set_status",
          payload: { transition: pendingTransition },
          reason,
          operatingCompanyId: companyId,
          invalidateKeys: [["loads"]],
        },
        () => {
          selection.clear();
          onBulkComplete?.();
        }
      );
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Bulk load update failed", "error");
    }
  };

  const renderUnitCell = (load: DispatchLoadRow) =>
    inlineQuicksaveEnabled && companyId ? (
      <InlineUnitPicker
        loadId={load.id}
        operatingCompanyId={companyId}
        unitId={load.assigned_unit_id}
        displayLabel={load.assigned_unit_number ?? "—"}
        onAssigned={({ unitId, label }) =>
          setRowOverrides((prev) => ({
            ...prev,
            [load.id]: { ...prev[load.id], unitId, unitLabel: label },
          }))
        }
        onRollback={() =>
          setRowOverrides((prev) => {
            const next = { ...prev };
            delete next[load.id]?.unitId;
            return next;
          })
        }
      />
    ) : (
      load.assigned_unit_number ?? "—"
    );

  const renderDriverCell = (load: DispatchLoadRow) =>
    inlineQuicksaveEnabled && companyId ? (
      <InlineDriverPicker
        loadId={load.id}
        operatingCompanyId={companyId}
        driverId={load.assigned_primary_driver_id}
        displayLabel={load.assigned_primary_driver_name ?? "Unassigned"}
        onAssigned={({ driverId, label }) =>
          setRowOverrides((prev) => ({
            ...prev,
            [load.id]: { ...prev[load.id], driverId, driverLabel: label },
          }))
        }
        onRollback={() =>
          setRowOverrides((prev) => {
            const next = { ...prev };
            delete next[load.id]?.driverId;
            return next;
          })
        }
      />
    ) : (
      load.assigned_primary_driver_name ?? "Unassigned"
    );

  const renderTriSignalCell = (load: DispatchLoadRow) => (
    <TriSignalPill signal={triSignalByLoadId.get(load.id)} loading={triSignalsQuery.isLoading && Boolean(companyId)} />
  );

  const renderStatusCell = (load: DispatchLoadRow) => (
    <div className="flex items-center gap-1">
      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusVariant(load.status)}`}>
        {STATUS_LABEL[load.status]}
      </span>
      {load.assigned_unit_id && activeGeofenceBreachVehicleIds?.has(load.assigned_unit_id) ? (
        <span className="rounded bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">Geofence alert</span>
      ) : null}
    </div>
  );

  const renderPreSettlementPrompt = (load: DispatchLoadRow, colSpan: number) => {
    const effectiveDriverId = rowOverrides[load.id]?.driverId ?? load.assigned_primary_driver_id;
    const openPreSettlement = effectiveDriverId ? openPreSettlementsMap.get(effectiveDriverId) : undefined;
    const showPreSettlementPrompt = Boolean(
      openPreSettlement &&
        openPreSettlement.first_load_id !== load.id &&
        !["delivered", "delivered_pending_docs", "completed_docs_received", "closed", "paid", "invoiced", "cancelled"].includes(
          load.status
        )
    );
    if (!showPreSettlementPrompt || !openPreSettlement) return null;
    return (
      <tr className="border-b border-amber-100 bg-amber-50">
        <td colSpan={colSpan} className="px-3 py-1.5">
          <div className="flex items-center gap-2 text-xs text-amber-900">
            <span className="font-semibold">⚠ Driver has open pre-settlement</span>
            {openPreSettlement.settlement_number ? (
              <span className="font-mono text-amber-700">{openPreSettlement.settlement_number}</span>
            ) : null}
            <span className="text-amber-600">· add this load to it?</span>
            <button
              type="button"
              className="rounded bg-amber-300 px-2 py-0.5 text-xs font-semibold text-amber-900 hover:bg-amber-400"
              onClick={(event) => {
                event.stopPropagation();
                addLoadMutation.mutate({
                  settlementId: openPreSettlement.settlement_id,
                  loadId: load.id,
                  ocId: load.operating_company_id,
                });
              }}
            >
              Add to it
            </button>
          </div>
        </td>
      </tr>
    );
  };

  const renderLoadRows = (
    rows: DispatchLoadRow[],
    columns: Array<{ key: string; header: string; cell: (load: BoardLoad) => ReactNode }>,
    options?: { showBulk?: boolean }
  ) => {
    const showBulk = options?.showBulk ?? true;
    const colSpan = columns.length + (showBulk ? 1 : 0);

    return rows.map((load) => {
      const boardLoad = readBoardLoad(load);
      return (
        <Fragment key={load.id}>
          <tr onClick={() => onRowClick(load.id)} className="cursor-pointer border-b border-gray-100 hover:bg-gray-50">
            {showBulk ? (
              <td className="px-2 py-2" onClick={(event) => event.stopPropagation()}>
                <input
                  type="checkbox"
                  aria-label={`Select load ${load.load_number}`}
                  checked={selection.selectedIds.has(load.id)}
                  onChange={() => {
                    const next = new Set(selection.selectedIds);
                    if (next.has(load.id)) next.delete(load.id);
                    else next.add(load.id);
                    selection.setSelectedIds(next);
                  }}
                />
              </td>
            ) : null}
            {columns.map((column) => (
              <td key={column.key} className="px-3 py-2 text-[11px]">
                {column.cell(boardLoad)}
              </td>
            ))}
          </tr>
          {renderPreSettlementPrompt(load, colSpan)}
        </Fragment>
      );
    });
  };

  const listColumns: Array<{ key: string; header: string; cell: (load: BoardLoad) => ReactNode }> = [
    { key: "load", header: "Load", cell: (load) => <span className="code-cell font-medium text-gray-800">{load.load_number}</span> },
    { key: "customer", header: "Customer", cell: (load) => load.customer_name ?? "—" },
    { key: "unit", header: "Unit", cell: (load) => renderUnitCell(load) },
    { key: "driver", header: "Driver", cell: (load) => renderDriverCell(load) },
    { key: "status_signal", header: "Status Signal", cell: (load) => renderTriSignalCell(load) },
    {
      key: "cargo_temp",
      header: "Cargo Temp",
      cell: (load) => (
        <CargoTempBadge
          loadId={load.id}
          operatingCompanyId={load.operating_company_id}
          reefer={isReeferCommodity(load.commodity)}
        />
      ),
    },
    { key: "lane", header: "Lane", cell: (load) => laneSummary(load) },
    { key: "delivery", header: "Delivery", cell: (load) => load.first_delivery_city ?? "—" },
    { key: "live_gps", header: "Live GPS", cell: (load) => <LoadLivePositionCell position={null} loadId={load.id} /> },
    { key: "risk", header: "Risk", cell: (load) => <RiskCell load={load} /> },
    { key: "status", header: "Status", cell: (load) => renderStatusCell(load) },
  ];

  const tableColumns: Array<{ key: string; header: string; cell: (load: BoardLoad) => ReactNode }> = [
    { key: "unit", header: "Unit", cell: (load) => renderUnitCell(load) },
    { key: "trailer", header: "Trailer", cell: (load) => load.trailer_number ?? "—" },
    { key: "load", header: "Load #", cell: (load) => <span className="code-cell font-medium text-gray-800">{load.load_number}</span> },
    { key: "customer", header: "Customer", cell: (load) => load.customer_name ?? "—" },
    { key: "wo", header: "WO #", cell: (load) => load.customer_wo_number ?? "—" },
    { key: "commodity", header: "Commodity", cell: (load) => load.commodity ?? "—" },
    {
      key: "cargo_temp",
      header: "Cargo Temp",
      cell: (load) => (
        <CargoTempBadge
          loadId={load.id}
          operatingCompanyId={load.operating_company_id}
          reefer={isReeferCommodity(load.commodity)}
        />
      ),
    },
    { key: "lane", header: "Lane", cell: (load) => laneSummary(load) },
    { key: "linehaul", header: "Linehaul", cell: (load) => formatMoneyCents(linehaulCents(load), load.currency_code) },
    { key: "flag", header: "Flag", cell: (load) => FLAG_EMOJI_BY_CODE[load.flag_code] ?? "⚪" },
    { key: "driver", header: "Driver", cell: (load) => renderDriverCell(load) },
    { key: "status_signal", header: "Status Signal", cell: (load) => renderTriSignalCell(load) },
    { key: "delivery", header: "Delivery", cell: (load) => load.first_delivery_city ?? "—" },
    { key: "live_gps", header: "Live GPS", cell: (load) => <LoadLivePositionCell position={null} loadId={load.id} /> },
    { key: "risk", header: "Risk", cell: (load) => <RiskCell load={load} /> },
    { key: "status", header: "Status", cell: (load) => renderStatusCell(load) },
  ];

  const renderListOrTable = (columns: typeof listColumns) => {
    if (listError) {
      return (
        <ListErrorState
          title="Couldn't load dispatch list"
          status={listError.status}
          message={listError.message}
          onRetry={listError.onRetry}
        />
      );
    }

    if (!loading && sortedLoads.length === 0) {
      return (
        <div className="rounded border border-gray-200 bg-white p-6 text-sm text-gray-500">
          No loads match your filters.{" "}
          <button type="button" className="font-semibold text-blue-700 hover:underline" onClick={() => onPageChange(0)}>
            Go back to first page
          </button>
        </div>
      );
    }

    return (
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Showing {from}-{to} of {totalCount}
          </div>
          <div className="flex items-center gap-2">
            {selection.count > 0 ? (
              <Button type="button" variant="secondary" size="sm" onClick={exportSelectedCsv}>
                Export Selected to CSV
              </Button>
            ) : null}
            <Button type="button" variant="secondary" size="sm" onClick={onExportCsv}>
              Export CSV
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <TableSelection
            rows={sortedLoads}
            getId={(load) => load.id}
            selectedIds={selection.selectedIds}
            onSelectionChange={selection.setSelectedIds}
            pageRowIds={pageRowIds}
            onCapExceeded={(message) => pushToast(message, "error")}
          >
            {(selectCtx) => (
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
                  <tr>
                    <th className="w-10 px-2 py-2">
                      <TableSelectionHeader
                        selectedIds={selection.selectedIds}
                        pageRowIds={pageRowIds}
                        onSelectionChange={selection.setSelectedIds}
                        onCapExceeded={(message) => pushToast(message, "error")}
                      />
                    </th>
                    {columns.map((column) => (
                      <th key={column.key} className="px-3 py-2">
                        {column.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={columns.length + 1} className="px-3 py-3 text-gray-400">
                        Loading loads...
                      </td>
                    </tr>
                  ) : (
                    sortedLoads.map((load) => {
                      const boardLoad = readBoardLoad(load);
                      return (
                        <Fragment key={load.id}>
                          <tr
                            onClick={() => onRowClick(load.id)}
                            className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
                          >
                            <td className="px-2 py-2" onClick={(event) => event.stopPropagation()}>
                              <input
                                type="checkbox"
                                aria-label={`Select load ${load.load_number}`}
                                checked={selectCtx.isSelected(load.id)}
                                onChange={() => selectCtx.toggle(load.id)}
                              />
                            </td>
                            {columns.map((column) => (
                              <td key={column.key} className="px-3 py-2 text-[11px]">
                                {column.cell(boardLoad)}
                              </td>
                            ))}
                          </tr>
                          {renderPreSettlementPrompt(load, columns.length + 1)}
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </TableSelection>
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 pt-2 text-sm">
          <Button type="button" variant="secondary" size="sm" disabled={!hasPrev} onClick={() => onPageChange(Math.max(0, offset - limit))}>
            Previous
          </Button>
          <span className="text-gray-600">
            Showing {from}-{to} of {totalCount}
          </span>
          <Button type="button" variant="secondary" size="sm" disabled={!hasNext} onClick={() => onPageChange(offset + limit)}>
            Next
          </Button>
        </div>
      </section>
    );
  };

  const renderAssignmentView = () => {
    if (listError) {
      return (
        <ListErrorState
          title="Couldn't load assignment board"
          status={listError.status}
          message={listError.message}
          onRetry={listError.onRetry}
        />
      );
    }

    return (
      <div className="space-y-4" data-testid="dispatch-board-assignment-view">
        <AssignmentBand title="Unassigned Units" count={unassignedUnits.length}>
          <div className="overflow-x-auto rounded border border-gray-200 bg-white">
            <table className="min-w-full text-left text-[11px]">
              <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-600">
                <tr>
                  {["Unit", "Trailer", "Driver", "Last Drop", "Idle"].map((header) => (
                    <th key={header} className="px-2 py-1">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {unitsWithoutLoadQuery.isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-2 py-3 text-gray-400">
                      Loading unassigned units...
                    </td>
                  </tr>
                ) : (
                  unassignedUnits.map((unit: UnitsWithoutLoad) => (
                    <tr key={unit.id} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-2 py-1 font-semibold">{unit.unit_number}</td>
                      <td className="px-2 py-1">{unit.trailer_number ?? "—"}</td>
                      <td className="px-2 py-1">{unit.driver_name ?? "—"}</td>
                      <td className="px-2 py-1">
                        {unit.last_drop_at ? new Date(unit.last_drop_at).toLocaleString() : "No prior drop"}
                      </td>
                      <td className="px-2 py-1">
                        {unit.hours_since_last_delivery != null ? `${unit.hours_since_last_delivery}h idle` : "—"}
                      </td>
                    </tr>
                  ))
                )}
                {!unitsWithoutLoadQuery.isLoading && unassignedUnits.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-2 py-3 text-center text-gray-500">
                      All units currently have active loads.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </AssignmentBand>

        <AssignmentBand title="Booked Loads" count={bookedLoads.length}>
          <div className="overflow-x-auto rounded border border-gray-200 bg-white">
            <table className="min-w-full text-left text-[11px]">
              <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-600">
                <tr>
                  {["Load", "Customer", "Lane", "Delivery", "Doc-Compliance", "Cargo Temp", "Status"].map((header) => (
                    <th key={header} className="px-2 py-1">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-2 py-3 text-gray-400">
                      Loading booked loads...
                    </td>
                  </tr>
                ) : (
                  renderLoadRows(bookedLoads, [
                    {
                      key: "load",
                      header: "Load",
                      cell: (load) => <span className="code-cell font-medium">{load.load_number}</span>,
                    },
                    { key: "customer", header: "Customer", cell: (load) => load.customer_name ?? "—" },
                    { key: "lane", header: "Lane", cell: (load) => laneSummary(load) },
                    { key: "delivery", header: "Delivery", cell: (load) => load.first_delivery_city ?? "—" },
                    { key: "doc", header: "Doc-Compliance", cell: (load) => <DocComplianceCell load={load} /> },
                    {
                      key: "cargo_temp",
                      header: "Cargo Temp",
                      cell: (load) => (
                        <CargoTempBadge
                          loadId={load.id}
                          operatingCompanyId={load.operating_company_id}
                          reefer={isReeferCommodity(load.commodity)}
                        />
                      ),
                    },
                    { key: "status", header: "Status", cell: (load) => renderStatusCell(load) },
                  ], { showBulk: false })
                )}
                {!loading && bookedLoads.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-2 py-3 text-center text-gray-500">
                      No reserved loads waiting for assignment.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </AssignmentBand>

        <AssignmentBand title="Assigned Units" count={assignedLoads.length}>
          <div className="overflow-x-auto rounded border border-gray-200 bg-white">
            <table className="min-w-full text-left text-[11px]">
              <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-600">
                <tr>
                  {["Unit", "Trailer", "Cargo Temp", "Load", "Customer", "Driver", "Lane", "Delivery", "Status"].map((header) => (
                    <th key={header} className="px-2 py-1">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-2 py-3 text-gray-400">
                      Loading assigned units...
                    </td>
                  </tr>
                ) : (
                  renderLoadRows(assignedLoads, [
                    { key: "unit", header: "Unit", cell: (load) => renderUnitCell(load) },
                    { key: "trailer", header: "Trailer", cell: (load) => load.trailer_number ?? "—" },
                    {
                      key: "cargo_temp",
                      header: "Cargo Temp",
                      cell: (load) => (
                        <CargoTempBadge
                          loadId={load.id}
                          operatingCompanyId={load.operating_company_id}
                          reefer={isReeferCommodity(load.commodity)}
                        />
                      ),
                    },
                    {
                      key: "load",
                      header: "Load",
                      cell: (load) => <span className="code-cell font-medium">{load.load_number}</span>,
                    },
                    { key: "customer", header: "Customer", cell: (load) => load.customer_name ?? "—" },
                    { key: "driver", header: "Driver", cell: (load) => renderDriverCell(load) },
                    { key: "lane", header: "Lane", cell: (load) => laneSummary(load) },
                    { key: "delivery", header: "Delivery", cell: (load) => load.first_delivery_city ?? "—" },
                    { key: "status", header: "Status", cell: (load) => renderStatusCell(load) },
                  ], { showBulk: false })
                )}
                {!loading && assignedLoads.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-2 py-3 text-center text-gray-500">
                      No assigned units on current page.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </AssignmentBand>
      </div>
    );
  };

  return (
    <div className="space-y-2" data-testid="dispatch-board">
      <div className="flex flex-wrap items-center gap-2 rounded border border-gray-200 bg-white p-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Board view</span>
        {BOARD_MODES.map((mode) => (
          <Button
            key={mode.id}
            type="button"
            size="sm"
            variant={boardMode === mode.id ? "primary" : "secondary"}
            data-testid={mode.testId}
            onClick={() => setBoardMode(mode.id)}
          >
            {mode.label}
          </Button>
        ))}
      </div>

      <BulkActionBar
        selectedCount={selection.count}
        actions={[
          {
            id: "set-status",
            label: "Set status",
            onClick: () => setStatusModalOpen(true),
          },
        ]}
        onClear={selection.clear}
      />

      {boardMode === "assignment"
        ? renderAssignmentView()
        : boardMode === "table"
          ? renderListOrTable(tableColumns)
          : renderListOrTable(listColumns)}

      <BulkActionModal
        open={statusModalOpen}
        actionLabel="Set load status"
        affectedCount={selection.count}
        requiresReason
        description="Apply a dispatch status transition to selected loads. Invalid transitions are reported per row."
        payloadFields={
          <label className="block text-sm text-gray-700">
            Transition
            <select
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
              value={pendingTransition}
              onChange={(event) => setPendingTransition(event.target.value)}
            >
              {LOAD_TRANSITION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        }
        onCancel={() => setStatusModalOpen(false)}
        onConfirm={({ reason }) => void runStatusBulk(reason)}
      />

      <BulkProgressDialog
        open={bulk.progressOpen}
        loading={bulk.progressLoading}
        requested={bulk.progress.requested}
        succeeded={bulk.progress.succeeded}
        failed={bulk.progress.failed}
        bulk_call_id={bulk.progress.bulk_call_id}
        onClose={() => bulk.setProgressOpen(false)}
        resolveRowHref={(id) => `/dispatch?load_id=${encodeURIComponent(id)}`}
      />
    </div>
  );
}
