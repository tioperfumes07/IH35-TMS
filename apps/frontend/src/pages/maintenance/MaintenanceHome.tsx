import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InTransitIssue, MaintenancePartRow, WorkOrderType } from "../../api/maintenance";
import {
  convertInTransitIssueToDamage,
  getMaintenanceInTransitQueue,
  getMaintenanceKpis,
  getMaintenanceRecentActivity,
  getMaintenanceRmStatus,
  getMaintenanceSevereAlerts,
  getWorkOrder,
  listMaintenanceParts,
  listMaintPmDue,
  listPartsInventory,
  listWorkOrdersFiltered,
  transitionWorkOrder,
} from "../../api/maintenance";
import { apiRequest } from "../../api/client";
import { PageHeader } from "../../components/forms/shared/PageHeader";
import { ActionButton } from "../../components/shared/ActionButton";
import { HoverDropdownNav, type NavItem } from "../../components/forms/shared/HoverDropdownNav";
import { SubTabRow } from "../../components/layout/SubTabRow";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { maintenancePartsStockQueryKey } from "../inventory/partsStockQueryKeys";
import { ArrivingSoonPage } from "./ArrivingSoonPage";
import { DriverReportsQueuePage } from "./DriverReportsQueuePage";
import { FleetTablePage } from "./FleetTablePage";
import { MaintenanceSettingsPage } from "./MaintenanceSettingsPage";
import { ServiceLocationPage } from "./ServiceLocationPage";
import { CreateWorkOrderModal } from "./components/CreateWorkOrderModal";
import { CreateBillModal } from "./components/CreateBillModal";
import { CreateExpenseModal } from "./components/CreateExpenseModal";
import { MaintenanceDamageRegisterTab } from "./components/MaintenanceDamageRegisterTab";
import { DtcAutoWorkOrdersCard } from "./components/DtcAutoWorkOrdersCard";
import { InTransitIssuesTable } from "./components/InTransitIssuesTable";
import { InTransitTriageBand } from "./components/InTransitTriageBand";
import { SevereAlertsBand } from "./components/SevereAlertsBand";
import { IntegrationsStrip } from "./components/IntegrationsStrip";
import { MaintKpiRows } from "./components/MaintKpiRows";
import { MaintenancePmCountdownCards } from "./components/MaintenancePmCountdownCards";
import { MaintenanceAlertsCard } from "./components/MaintenanceAlertsCard";
import { PartsInventoryTable } from "./components/PartsInventoryTable";
import { QuickActionsBar } from "./components/QuickActionsBar";
import { RMBucketsGrid } from "./components/RMBucketsGrid";
import { RMStatStrip } from "./components/RMStatStrip";
import { RoadServiceActivePanel } from "./components/RoadServiceActivePanel";
import { RecentActivityRow } from "./components/RecentActivityRow";
import { RoadServiceList } from "./RoadServiceList";
import { SevereRepairOosTab } from "./components/SevereRepairOosTab";
import { TriageModal } from "./components/TriageModal";
import { BrakeWearDashboard } from "./brakes/BrakeWearDashboard";
import { PreFlightDvirQueue } from "./pre-flight/PreFlightDvirQueue";
import { TireWearDashboard } from "./tires/TireWearDashboard";
import { WorkOrderDetailModal } from "../../components/maintenance/WorkOrderDetailModal";
import { WorkOrdersTable } from "./components/WorkOrdersTable";
import { partNeedsReorder } from "./parts-low-stock";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ListErrorState } from "../../components/ListErrorState";
import {
  MAINTENANCE_MASTER_DATA_LINKS,
  MAINTENANCE_OPERATION_LINKS,
} from "../../components/maintenance/MAINTENANCE_NAV_CONFIG";
import { MAINTENANCE_TAB_PATH, maintenanceTabFromPath } from "../../router/route-manifest";

export { MAINTENANCE_MASTER_DATA_LINKS, MAINTENANCE_OPERATION_LINKS } from "../../components/maintenance/MAINTENANCE_NAV_CONFIG";

// Approved order (maintenance-FULL-with-chrome.html): R&M Status Board is the landing tab, then Fleet
// Table, then Active WOs. Additive reorder only — every existing tab is preserved.
const SUBNAV = [
  { id: "rm_status_board", label: "R&M Status Board" },
  { id: "fleet_table", label: "Fleet Table" },
  { id: "active_wos", label: "Active WOs" },
  { id: "service_location", label: "Service / Location" },
  { id: "arriving_soon", label: "Arriving Soon" },
  { id: "in_transit_issues", label: "In-Transit Issues" },
  { id: "damage_reports", label: "Damage Reports" },
  { id: "driver_reports", label: "Driver Reports" },
  { id: "severe_repairs", label: "Severe Repairs" },
  { id: "road_service", label: "Road Service" },
  { id: "parts_inventory", label: "Parts Inventory" },
  { id: "brake_wear", label: "Brake Wear" },
  { id: "tire_wear", label: "Tire Wear" },
  { id: "pre_flight_dvir", label: "Pre-Flight DVIR" },
  { id: "settings", label: "Settings" },
] as const;

export type MaintenanceTabId = (typeof SUBNAV)[number]["id"];

type Props = {
  initialTab?: MaintenanceTabId;
};

export function MaintenanceHomePage({ initialTab = "rm_status_board" }: Props) {
  const location = useLocation();
  const { selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const companyId = selectedCompanyId ?? "";
  const [createWoOpen, setCreateWoOpen] = useState(false);
  const [createWoType, setCreateWoType] = useState<WorkOrderType>("pm");
  const [createBillOpen, setCreateBillOpen] = useState(false);
  const [createExpenseOpen, setCreateExpenseOpen] = useState(false);
  const [prefillFromIssue, setPrefillFromIssue] = useState<InTransitIssue | null>(null);
  const [triageIssue, setTriageIssue] = useState<InTransitIssue | null>(null);
  const [triagePage, setTriagePage] = useState(1);
  const triagePageSize = 50;
  const [rmStatusPage, setRmStatusPage] = useState(0);
  const rmStatusPageSize = 50;
  const [recentWoPage, setRecentWoPage] = useState(0);
  const [completedWoPage, setCompletedWoPage] = useState(0);
  const activityPageSize = 5;
  // LV-MAINT-RM-STATUS-BOARD-SHELL / LV-MAINTENANCE-*-SHELL: derive from pathname when it
  // matches a leaf; otherwise honor MaintenanceTabRoute initialTab (never invent active_wos).
  const tab = (maintenanceTabFromPath(location.pathname) ?? initialTab) as MaintenanceTabId;
  const [sourceTypeFilter, setSourceTypeFilter] = useState("");
  const [externalVendorFilter, setExternalVendorFilter] = useState("");
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<string | null>(null);
  const statusGenerationRef = useRef(0);
  // Service/Location drill-through: ?location=&bucket= narrow the Active-WOs list to that location.
  const [searchParams] = useSearchParams();
  const locationFilter = searchParams.get("location") ?? "";
  const bucketFilter = searchParams.get("bucket") ?? "";
  const partInventoryId = searchParams.get("part_inventory_id")?.trim() ?? "";
  const driverReportId = searchParams.get("driver_report_id")?.trim() ?? "";
  const driverReportsDriverId = searchParams.get("driver_id")?.trim() ?? "";
  const driverReportsLoadId = searchParams.get("load_id")?.trim() ?? "";

  const kpisQuery = useQuery({
    queryKey: ["maintenance", "dashboard", "kpis", companyId],
    queryFn: () => getMaintenanceKpis(companyId),
    enabled: Boolean(companyId),
  });
  const rmStatusQuery = useQuery({
    queryKey: ["maintenance", "dashboard", "rm-status", companyId, rmStatusPage],
    queryFn: () => getMaintenanceRmStatus(companyId, { limit: rmStatusPageSize, offset: rmStatusPage * rmStatusPageSize }),
    enabled: Boolean(companyId),
  });
  useEffect(() => setRmStatusPage(0), [companyId]);
  const triageQuery = useQuery({
    queryKey: ["maintenance", "dashboard", "triage", companyId],
    queryFn: () => getMaintenanceInTransitQueue(companyId, { limit: 50, offset: 0 }),
    enabled: Boolean(companyId),
  });
  useEffect(() => {
    if (triageQuery.isError) setTriageIssue(null);
  }, [triageQuery.isError]);
  const triageTableQuery = useQuery({
    queryKey: ["maintenance", "dashboard", "triage-table", companyId, triagePage],
    queryFn: () => getMaintenanceInTransitQueue(companyId, { limit: triagePageSize, offset: (triagePage - 1) * triagePageSize }),
    enabled: Boolean(companyId) && tab === "in_transit_issues",
  });
  const triageTotalPages = Math.max(1, Math.ceil((triageTableQuery.data?.total_count ?? 0) / triagePageSize));
  useEffect(() => setTriagePage(1), [companyId]);
  useEffect(() => {
    if (triagePage > triageTotalPages) setTriagePage(triageTotalPages);
  }, [triagePage, triageTotalPages]);
  const severeAlertsQuery = useQuery({
    queryKey: ["maintenance", "dashboard", "severe-alerts", companyId],
    queryFn: () => getMaintenanceSevereAlerts(companyId),
    enabled: Boolean(companyId),
  });
  const recentQuery = useQuery({
    queryKey: ["maintenance", "dashboard", "recent", companyId, recentWoPage, completedWoPage],
    queryFn: () => getMaintenanceRecentActivity(companyId, {
      limit: activityPageSize,
      recent_offset: recentWoPage * activityPageSize,
      completed_offset: completedWoPage * activityPageSize,
    }),
    enabled: Boolean(companyId),
  });
  useEffect(() => { setRecentWoPage(0); setCompletedWoPage(0); }, [companyId]);
  const workOrdersQuery = useQuery({
    queryKey: [
      "maintenance",
      "work-orders",
      companyId,
      sourceTypeFilter,
      externalVendorFilter,
      locationFilter,
      bucketFilter,
      driverReportsDriverId,
      driverReportsLoadId,
    ],
    queryFn: () =>
      listWorkOrdersFiltered(companyId, {
        source_type: sourceTypeFilter || undefined,
        external_vendor_id: externalVendorFilter || undefined,
        location: locationFilter || undefined,
        bucket: bucketFilter || undefined,
        driver_id: driverReportsDriverId || undefined,
        load_id: driverReportsLoadId || undefined,
      }),
    enabled: Boolean(companyId),
  });
  const workOrderDetailQuery = useQuery({
    queryKey: ["maintenance", "work-order-detail", companyId, selectedWorkOrderId],
    queryFn: () => getWorkOrder(String(selectedWorkOrderId), companyId),
    enabled: Boolean(companyId && selectedWorkOrderId),
  });
  const loadedWorkOrderId = workOrderDetailQuery.isError
    ? null
    : String(workOrderDetailQuery.data?.id ?? "").trim() || null;
  const partsInventoryRowsQuery = useQuery({
    queryKey: maintenancePartsStockQueryKey(companyId),
    queryFn: () => listPartsInventory(companyId),
    enabled: Boolean(companyId),
  });
  const partsInventoryKpisQuery = useQuery({
    queryKey: ["maintenance", "parts-inventory-kpis", companyId],
    queryFn: () => apiRequest<{ total_parts: number; low_stock_count: number; total_inventory_value: number }>(`/api/v1/maintenance/parts-inventory/kpis?operating_company_id=${encodeURIComponent(companyId)}`),
    enabled: Boolean(companyId),
  });
  const pmDueQuery = useQuery({
    // includeNotDue: this query feeds ONLY the PM Countdown cards (below), and a countdown is about
    // schedules that have NOT come due yet. The endpoint filters to is_due by default, so on a fleet
    // with nothing overdue the cards got an empty list and said "No active schedule" — for schedules
    // that exist and are active. The key carries the flag so it cannot share a cache entry with a
    // due-only fetch of the same company.
    queryKey: ["maintenance", "maint-pm-due", companyId, "include-not-due"],
    queryFn: () => listMaintPmDue(companyId, { includeNotDue: true }),
    enabled: Boolean(companyId),
    retry: false,
  });
  const partsReorderQuery = useQuery({
    queryKey: ["maintenance", "parts-reorder-flags", companyId],
    queryFn: () => listMaintenanceParts(companyId),
    enabled: Boolean(companyId),
    retry: false,
  });
  const statusMutation = useMutation({
    mutationFn: (args: { id: string; status: "in_progress" | "waiting_parts" | "complete"; companyId: string; generation: number }) =>
      transitionWorkOrder(args.id, args.companyId, { new_status: args.status }),
    onSuccess: async (_result, args) => {
      if (args.generation !== statusGenerationRef.current) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["maintenance", "dashboard", "rm-status", args.companyId] }),
        queryClient.invalidateQueries({ queryKey: ["maintenance", "dashboard", "recent", args.companyId] }),
        // WO-DETAIL-MODAL-COMPLETE-DEAD-BUTTON: without this, WorkOrderDetailModal's Status/V5
        // fields stay stale after a transition fired from inside the open modal (e.g. Mark
        // Completed), even though the write succeeded — only a full page reload showed it.
        queryClient.invalidateQueries({ queryKey: ["maintenance", "work-order-detail", args.companyId] }),
      ]);
      pushToast("R&M status updated", "success");
    },
    onError: (_error, args) => {
      if (args.generation === statusGenerationRef.current) {
        pushToast("Failed to update R&M status", "error");
      }
    },
  });

  useEffect(() => {
    statusGenerationRef.current += 1;
    statusMutation.reset();
    setSelectedWorkOrderId(null);
  }, [companyId]);

  useEffect(() => {
    statusGenerationRef.current += 1;
    statusMutation.reset();
  }, [selectedWorkOrderId]);

  // CLS-MONEY-KPI-FAKE-ZERO remainder (maintenance): never substitute a zero object when the
  // dashboard KPI fetch fails or has not arrived — MaintKpiRows/RMStatStrip render "—" for absent
  // fields. A fabricated open_wos:0 next to a loaded work-order table is the Cascade finding.
  const kpis = useMemo(
    () => (kpisQuery.isError ? ({} as NonNullable<typeof kpisQuery.data>) : (kpisQuery.data ?? ({} as NonNullable<typeof kpisQuery.data>))),
    [kpisQuery.data, kpisQuery.isError]
  );

  const partsReorderRows = partsReorderQuery.data?.rows ?? [];

  const partsReorderColumns = useMemo<ParityColumn<MaintenancePartRow>[]>(
    () => [
      { key: "part_number", label: "Part #", sortable: true, render: (row) => row.part_number },
      { key: "name", label: "Part", sortable: true, render: (row) => row.name },
      { key: "qty_on_hand", label: "On Hand", sortable: true, render: (row) => row.qty_on_hand },
      { key: "reorder_threshold", label: "Reorder Threshold", render: (row) => row.reorder_threshold },
      {
        key: "flag",
        label: "Flag",
        render: (row) =>
          partNeedsReorder(row.qty_on_hand, row.reorder_threshold) ? (
            <span className="rounded-sm bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">REORDER</span>
          ) : (
            <span className="rounded-sm bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">OK</span>
          ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-3">
      <PageHeader
        title="Maintenance"
        subtitle="Work orders, fleet maintenance, parts inventory, and PM scheduling"
        actions={
          <div className="flex items-center gap-2">
            <ActionButton type="button" onClick={() => setCreateBillOpen(true)}>
              + Create Bill
            </ActionButton>
            <ActionButton type="button" onClick={() => setCreateExpenseOpen(true)}>
              + Create Expense
            </ActionButton>
            <QuickActionsBar
              onCreate={(type) => {
                setCreateWoType(type);
                setPrefillFromIssue(null);
                setCreateWoOpen(true);
              }}
            />
          </div>
        }
      />

      <MaintenanceSubNav />

      <SubTabRow data-subtab-row="maintenance">
        {SUBNAV.map((item) => {
          const active = item.id === tab;
          const target = MAINTENANCE_TAB_PATH[item.id] ?? "/maintenance";
          // LV-MAINT-SUBNAV-ARIA-CURRENT-ALIAS: NavLink aria-current is URL-path based, so aliases
          // (/maintenance/dvir → pre_flight_dvir) never get aria-current=page even when the leaf
          // body is correct — Live walks mis-read that as "dashboard shell". Drive current from tab id.
          return (
            <Link
              key={item.id}
              to={target}
              data-maintenance-subtab={item.id}
              aria-current={active ? "page" : undefined}
              className={`pb-0.5 text-xs font-semibold ${
                active ? "border-b-2 border-[#1f2a44] text-[#1f2a44]" : "border-b-2 border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </SubTabRow>

      <MaintKpiRows kpis={kpis} isError={kpisQuery.isError} />
      {/* On the R&M Status Board these three cards move into the right sidebar (compact) below; every
          other tab keeps its existing full-width layout. */}
      {companyId && tab !== "rm_status_board" ? (
        pmDueQuery.isError ? (
          <ListErrorState
            title="Couldn't load PM countdown"
            status={0}
            message={(pmDueQuery.error as Error)?.message}
            onRetry={() => void pmDueQuery.refetch()}
          />
        ) : (
          <MaintenancePmCountdownCards rows={pmDueQuery.data?.rows ?? []} loading={pmDueQuery.isLoading} />
        )
      ) : null}
      <IntegrationsStrip pendingQboCount={kpis.pending_qbo} />
      {companyId && tab !== "rm_status_board" ? <MaintenanceAlertsCard operatingCompanyId={companyId} /> : null}
      {companyId && tab !== "rm_status_board" ? <DtcAutoWorkOrdersCard operatingCompanyId={companyId} /> : null}

      {tab === "active_wos" ? (
        <div data-testid="maintenance-active-wos-tab" data-maintenance-tab="active_wos">
        {workOrdersQuery.isError ? (
          <ListErrorState
            title="Couldn't load active work orders"
            status={0}
            message={(workOrdersQuery.error as Error)?.message}
            onRetry={() => void workOrdersQuery.refetch()}
          />
        ) : (
          <WorkOrdersTable
            rows={workOrdersQuery.data?.work_orders ?? []}
            operatingCompanyId={companyId}
            loading={workOrdersQuery.isPending || (workOrdersQuery.isFetching && (workOrdersQuery.data?.work_orders?.length ?? 0) === 0)}
            sourceTypeFilter={sourceTypeFilter}
            externalVendorFilter={externalVendorFilter}
            onSourceTypeChange={setSourceTypeFilter}
            onExternalVendorChange={setExternalVendorFilter}
          />
        )}
        </div>
      ) : null}

      {tab === "rm_status_board" ? (
        // Approved rm-status-board.html: board LEFT + a compact ~168-180px right sidebar with
        // PM Countdown / PM Alerts / DTC / Road Service Active. Single-column stack on small screens.
        <div
          className="space-y-2"
          data-testid="rm-status-board"
          data-maintenance-tab="rm_status_board"
        >
          <RMStatStrip kpis={kpis} />
          <div className="grid grid-cols-1 gap-2 xl:grid-cols-[1fr_180px]">
          <div className="min-w-0">
            {rmStatusQuery.isError ? (
              <ListErrorState
                title="Couldn't load R&M status board"
                status={0}
                message={(rmStatusQuery.error as Error)?.message}
                onRetry={() => void rmStatusQuery.refetch()}
              />
            ) : (
              <RMBucketsGrid
                inHouse={rmStatusQuery.data?.in_house ?? []}
                external={rmStatusQuery.data?.external ?? []}
                roadside={rmStatusQuery.data?.roadside ?? []}
                onCreateRoadside={() => {
                  setCreateWoType("repair");
                  setPrefillFromIssue(null);
                  setCreateWoOpen(true);
                }}
                onOpen={(id) => setSelectedWorkOrderId(id)}
                statusActionPending={statusMutation.isPending}
                onAdvanceStatus={(id, status) => {
                  if (statusMutation.isPending) return;
                  statusMutation.mutate({
                    id,
                    status,
                    companyId,
                    generation: statusGenerationRef.current,
                  });
                }}
              />
            )}
            {!rmStatusQuery.isError && (rmStatusQuery.data?.total_count ?? 0) > rmStatusPageSize ? (
              <div className="mt-2 flex items-center justify-between text-xs text-slate-600" data-testid="rm-status-server-range">
                <span>{rmStatusPage * rmStatusPageSize + 1}–{Math.min((rmStatusPage + 1) * rmStatusPageSize, rmStatusQuery.data?.total_count ?? 0)} of {rmStatusQuery.data?.total_count ?? 0} open work orders</span>
                <div className="flex gap-2">
                  <button type="button" className="rounded border border-slate-300 px-2 py-1 disabled:opacity-50" disabled={rmStatusPage === 0 || rmStatusQuery.isFetching} onClick={() => setRmStatusPage((value) => Math.max(0, value - 1))}>Previous</button>
                  <button type="button" className="rounded border border-slate-300 px-2 py-1 disabled:opacity-50" disabled={(rmStatusPage + 1) * rmStatusPageSize >= (rmStatusQuery.data?.total_count ?? 0) || rmStatusQuery.isFetching} onClick={() => setRmStatusPage((value) => value + 1)}>Next</button>
                </div>
              </div>
            ) : null}
          </div>
          <aside className="flex flex-col gap-2">
            {companyId ? (
              pmDueQuery.isError ? (
                <ListErrorState
                  title="Couldn't load PM countdown"
                  status={0}
                  message={(pmDueQuery.error as Error)?.message}
                  onRetry={() => void pmDueQuery.refetch()}
                />
              ) : (
                <MaintenancePmCountdownCards rows={pmDueQuery.data?.rows ?? []} loading={pmDueQuery.isLoading} compact />
              )
            ) : null}
            {companyId ? <MaintenanceAlertsCard operatingCompanyId={companyId} compact /> : null}
            {companyId ? (
              <DtcAutoWorkOrdersCard operatingCompanyId={companyId} compact onOpen={(id) => setSelectedWorkOrderId(id)} />
            ) : null}
            {!rmStatusQuery.isError ? (
              <RoadServiceActivePanel
                roadside={rmStatusQuery.data?.roadside ?? []}
                onOpen={(id) => setSelectedWorkOrderId(id)}
              />
            ) : null}
            {triageQuery.isError ? (
              <ListErrorState
                title="Couldn't load in-transit triage queue"
                status={0}
                message={triageQuery.error instanceof Error ? triageQuery.error.message : undefined}
                onRetry={() => void triageQuery.refetch()}
              />
            ) : (
              <InTransitTriageBand
                issues={triageQuery.data?.issues ?? []}
                totalCount={triageQuery.data?.total_count ?? triageQuery.data?.issues?.length ?? 0}
                onTriage={(issue) => setTriageIssue(issue)}
              />
            )}
            {severeAlertsQuery.isError ? (
              <ListErrorState
                title="Couldn't load severe maintenance alerts"
                status={0}
                message={(severeAlertsQuery.error as Error)?.message}
                onRetry={() => void severeAlertsQuery.refetch()}
              />
            ) : (
              <SevereAlertsBand
                alerts={severeAlertsQuery.data?.alerts ?? []}
                totalCount={severeAlertsQuery.data?.total_count ?? severeAlertsQuery.data?.alerts?.length ?? 0}
                totalEstimatedCostAll={severeAlertsQuery.data?.total_estimated_cost_all}
              />
            )}
          </aside>
          </div>
        </div>
      ) : null}

      {tab === "fleet_table" ? (
        <div data-testid="maintenance-fleet-table-tab" data-maintenance-tab="fleet_table">
          <FleetTablePage operatingCompanyId={companyId} showMaintenanceColumns />
        </div>
      ) : null}

      {tab === "service_location" ? (
        <div data-testid="maintenance-service-location-tab" data-maintenance-tab="service_location">
          <ServiceLocationPage operatingCompanyId={companyId} />
        </div>
      ) : null}

      {tab === "arriving_soon" ? (
        <div data-testid="maintenance-arriving-soon-tab" data-maintenance-tab="arriving_soon">
          <ArrivingSoonPage operatingCompanyId={companyId} />
        </div>
      ) : null}

      {tab === "in_transit_issues"
        ? triageTableQuery.isError
          ? (
            <div className="rounded-sm border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <div className="font-semibold">Failed to load in-transit issues</div>
              <button
                type="button"
                className="mt-2 rounded-sm border border-red-300 bg-white px-2 py-1 text-xs font-semibold text-red-700"
                onClick={() => {
                  void triageTableQuery.refetch();
                  pushToast("Retrying in-transit issue load", "info");
                }}
              >
                Retry
              </button>
            </div>
            )
          : (
            <InTransitIssuesTable
              issues={triageTableQuery.data?.issues ?? []}
              totalCount={triageTableQuery.data?.total_count ?? triageTableQuery.data?.issues?.length ?? 0}
              loading={
                triageTableQuery.isPending ||
                (triageTableQuery.isFetching && (triageTableQuery.data?.issues?.length ?? 0) === 0)
              }
              onTriage={(issue) => setTriageIssue(issue)}
              page={triagePage}
              totalPages={triageTotalPages}
              onPageChange={setTriagePage}
              fetching={triageTableQuery.isFetching}
            />
            )
        : null}

      {/* Damage Reports = the FORMAL register (safety.incidents, read-only). The driver-PWA intake queue
          moved to its own "Driver Reports" tab below — additive, nothing removed. */}
      {tab === "damage_reports" ? (
        <div data-testid="maintenance-damage-reports-tab" data-maintenance-tab="damage_reports">
          <MaintenanceDamageRegisterTab operatingCompanyId={companyId} />
        </div>
      ) : null}

      {tab === "driver_reports" ? (
        <DriverReportsQueuePage
          highlightedReportId={driverReportId}
          filterDriverId={driverReportsDriverId}
          filterLoadId={driverReportsLoadId}
        />
      ) : null}

      {tab === "severe_repairs" ? <SevereRepairOosTab operatingCompanyId={companyId} /> : null}

      {tab === "road_service" ? (
        <div data-testid="maintenance-road-service-tab" data-maintenance-tab="road_service">
          <RoadServiceList operatingCompanyId={companyId} />
        </div>
      ) : null}

      {tab === "brake_wear" ? (
        <div data-testid="maintenance-brake-wear-tab" data-maintenance-tab="brake_wear">
          <BrakeWearDashboard />
        </div>
      ) : null}

      {tab === "tire_wear" ? (
        <div data-testid="maintenance-tire-wear-tab" data-maintenance-tab="tire_wear">
          <TireWearDashboard />
        </div>
      ) : null}

      {tab === "pre_flight_dvir" ? (
        <div data-testid="maintenance-pre-flight-dvir-tab" data-maintenance-tab="pre_flight_dvir">
          <PreFlightDvirQueue />
        </div>
      ) : null}

      {tab === "parts_inventory" ? (
        <div className="space-y-2" data-testid="maintenance-parts-inventory-tab" data-maintenance-tab="parts_inventory">
          {partsInventoryKpisQuery.isError ? (
            <ListErrorState
              title="Couldn't load parts inventory KPIs"
              status={0}
              message={(partsInventoryKpisQuery.error as Error)?.message}
              onRetry={() => void partsInventoryKpisQuery.refetch()}
            />
          ) : null}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            <div className="rounded-sm border border-gray-200 bg-white px-2 py-1 text-[11px]">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">Total Parts</div>
              <div className="font-semibold">
                {partsInventoryKpisQuery.isError ? "—" : (partsInventoryKpisQuery.data?.total_parts ?? 0)}
              </div>
            </div>
            <div className="rounded-sm border border-gray-200 bg-white px-2 py-1 text-[11px]">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">Low Stock</div>
              <div className="font-semibold">
                {partsInventoryKpisQuery.isError ? "—" : (partsInventoryKpisQuery.data?.low_stock_count ?? 0)}
              </div>
            </div>
            <div className="rounded-sm border border-gray-200 bg-white px-2 py-1 text-[11px]">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">Total Inventory Value</div>
              <div className="font-semibold">
                {partsInventoryKpisQuery.isError
                  ? "—"
                  : `$${Number(partsInventoryKpisQuery.data?.total_inventory_value ?? 0).toLocaleString()}`}
              </div>
            </div>
          </div>
          <PartsInventoryTable
            companyId={companyId}
            rows={partsInventoryRowsQuery.data ?? []}
            openPurchaseOnMount={searchParams.get("create") === "purchase"}
            loading={
              partsInventoryRowsQuery.isPending ||
              (partsInventoryRowsQuery.isFetching && (partsInventoryRowsQuery.data?.length ?? 0) === 0)
            }
            isError={partsInventoryRowsQuery.isError}
            onRetry={() => void partsInventoryRowsQuery.refetch()}
            highlightedRowId={partInventoryId}
          />
          <div className="rounded-sm border border-gray-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Parts Inventory Reorder Flags</h3>
              <div className="text-xs text-gray-500">Source: Parts &amp; Stock</div>
            </div>
            {partsReorderQuery.isError ? (
              <ListErrorState
                title="Couldn't load parts reorder flags"
                status={0}
                message={partsReorderQuery.error instanceof Error ? partsReorderQuery.error.message : undefined}
                onRetry={() => void partsReorderQuery.refetch()}
              />
            ) : (
              <ParityTable
                rows={partsReorderRows}
                columns={partsReorderColumns}
                rowKey={(row) => row.id}
                loading={partsReorderQuery.isLoading}
                storageKey="maintenance-parts-reorder-flags"
                emptyText="No parts inventory rows found."
              />
            )}
          </div>
        </div>
      ) : null}

      {tab === "settings" ? <MaintenanceSettingsPage operatingCompanyId={companyId} /> : null}

      {recentQuery.isError ? (
        <ListErrorState
          title="Couldn't load recent maintenance activity"
          status={0}
          message={recentQuery.error instanceof Error ? recentQuery.error.message : undefined}
          onRetry={() => void recentQuery.refetch()}
        />
      ) : (
      <RecentActivityRow
        recent={recentQuery.data?.recent ?? []}
        completed={recentQuery.data?.completed ?? []}
        recentTotalCount={recentQuery.data?.recent_total_count ?? recentQuery.data?.recent?.length ?? 0}
        completedTotalCount={recentQuery.data?.completed_total_count ?? recentQuery.data?.completed?.length ?? 0}
        pageSize={activityPageSize}
        recentPage={recentWoPage}
        completedPage={completedWoPage}
        fetching={recentQuery.isFetching}
        onRecentPageChange={setRecentWoPage}
        onCompletedPageChange={setCompletedWoPage}
        onOpen={(id) => setSelectedWorkOrderId(id)}
      />
      )}

      <TriageModal
        open={Boolean(triageIssue)}
        issue={triageIssue}
        onClose={() => setTriageIssue(null)}
        onConvertToWo={(issue) => {
          setPrefillFromIssue(issue);
          setCreateWoType(issue.issue_category?.toLowerCase().includes("tire") ? "tire" : issue.issue_category?.toLowerCase().includes("accident") ? "accident" : "repair");
          setCreateWoOpen(true);
          setTriageIssue(null);
        }}
        onConvertToDamage={async (issue) => {
          if (!companyId) return;
          try {
            await convertInTransitIssueToDamage(issue.id, companyId, {
              damage_category: issue.issue_category || "unspecified",
              additional_notes: issue.issue_description,
            });
            pushToast("Issue converted to damage report", "success");
            setTriageIssue(null);
            await queryClient.invalidateQueries({ queryKey: ["maintenance", "dashboard", "triage", companyId] });
          } catch {
            pushToast("Failed to convert issue to damage report", "error");
          }
        }}
      />

      <WorkOrderDetailModal
        open={Boolean(selectedWorkOrderId)}
        workOrder={(workOrderDetailQuery.isError ? null : workOrderDetailQuery.data ?? null) as Record<string, unknown> | null}
        loading={workOrderDetailQuery.isPending || workOrderDetailQuery.isFetching}
        readError={workOrderDetailQuery.isError ? "Work order details could not be loaded. Retry before taking action." : null}
        onRetry={() => void workOrderDetailQuery.refetch()}
        onComplete={
          selectedWorkOrderId &&
          loadedWorkOrderId === selectedWorkOrderId &&
          !workOrderDetailQuery.isError &&
          !workOrderDetailQuery.isFetching &&
          !statusMutation.isPending
            ? () => statusMutation.mutate({
                id: loadedWorkOrderId,
                status: "complete",
                companyId,
                generation: statusGenerationRef.current,
              })
            : undefined
        }
        onClose={() => setSelectedWorkOrderId(null)}
      />

      <CreateBillModal
        open={createBillOpen}
        operatingCompanyId={companyId}
        requireWoLink
        onClose={() => setCreateBillOpen(false)}
      />
      <CreateExpenseModal
        open={createExpenseOpen}
        operatingCompanyId={companyId}
        requireWoLink
        onClose={() => setCreateExpenseOpen(false)}
      />
      <CreateWorkOrderModal
        open={createWoOpen}
        operatingCompanyId={companyId}
        initialType={createWoType}
        initialValues={
          prefillFromIssue
            ? {
                unit_id: prefillFromIssue.unit_id,
                driver_id: prefillFromIssue.driver_id,
                source_type: "IT",
                source_intransit_issue_id: prefillFromIssue.id,
                load_id: prefillFromIssue.load_id ?? "",
                roadside_breakdown_load_id: prefillFromIssue.load_id ?? "",
                roadside_callout_at: prefillFromIssue.reported_at,
                roadside_location: `GPS: ${prefillFromIssue.gps_lat ?? "unknown"}, ${prefillFromIssue.gps_lng ?? "unknown"} ${prefillFromIssue.gps_label ?? ""}`.trim(),
                description: `${prefillFromIssue.issue_description}\nGPS: ${prefillFromIssue.gps_lat ?? ""},${prefillFromIssue.gps_lng ?? ""} ${prefillFromIssue.gps_label ?? ""}`.trim(),
                repair_location: "mobile_roadside",
                bucket: "roadside",
                class_hint: "Prefilled from triage issue",
              }
            : undefined
        }
        onClose={() => {
          setCreateWoOpen(false);
          setPrefillFromIssue(null);
        }}
        onCreated={async () => {
          setPrefillFromIssue(null);
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["maintenance", "dashboard", "kpis", companyId] }),
            queryClient.invalidateQueries({ queryKey: ["maintenance", "dashboard", "rm-status", companyId] }),
            queryClient.invalidateQueries({ queryKey: ["maintenance", "dashboard", "recent", companyId] }),
          ]);
        }}
      />
    </div>
  );
}

function maintenanceSubNavActiveHref(pathname: string): string {
  const norm = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  const all = [...MAINTENANCE_OPERATION_LINKS, ...MAINTENANCE_MASTER_DATA_LINKS];
  const exact = all.find((item) => item.path === norm);
  if (exact) return exact.path;
  if (norm === "/maintenance/in-transit" || norm === "/maintenance/triage") return "/maintenance/in-transit-issues";
  if (norm.startsWith("/maintenance/work-orders")) return "/maintenance";
  return "/maintenance";
}

const MAINTENANCE_MODULE_NAV_ITEMS: NavItem[] = [
  {
    label: "Master Data",
    href: MAINTENANCE_MASTER_DATA_LINKS[0]?.path ?? "/maintenance/vehicles",
    children: MAINTENANCE_MASTER_DATA_LINKS.map((item) => ({ label: item.label, href: item.path })),
  },
];

export function MaintenanceSubNav() {
  const { pathname } = useLocation();
  return (
    <HoverDropdownNav
      items={MAINTENANCE_MODULE_NAV_ITEMS}
      activeHref={maintenanceSubNavActiveHref(pathname)}
    />
  );
}

export function MaintenanceShell({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-3">
      <MaintenanceSubNav />
      {children}
    </div>
  );
}
