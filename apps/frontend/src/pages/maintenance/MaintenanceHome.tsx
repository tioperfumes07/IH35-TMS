import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation, useSearchParams } from "react-router-dom";
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
  const [tab, setTab] = useState<MaintenanceTabId>(initialTab);
  useEffect(() => {
    setTab(maintenanceTabFromPath(location.pathname) as MaintenanceTabId);
  }, [location.pathname]);
  const [sourceTypeFilter, setSourceTypeFilter] = useState("");
  const [externalVendorFilter, setExternalVendorFilter] = useState("");
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<string | null>(null);
  // Service/Location drill-through: ?location=&bucket= narrow the Active-WOs list to that location.
  const [searchParams] = useSearchParams();
  const locationFilter = searchParams.get("location") ?? "";
  const bucketFilter = searchParams.get("bucket") ?? "";

  const kpisQuery = useQuery({
    queryKey: ["maintenance", "dashboard", "kpis", companyId],
    queryFn: () => getMaintenanceKpis(companyId),
    enabled: Boolean(companyId),
  });
  const rmStatusQuery = useQuery({
    queryKey: ["maintenance", "dashboard", "rm-status", companyId],
    queryFn: () => getMaintenanceRmStatus(companyId),
    enabled: Boolean(companyId),
  });
  const triageQuery = useQuery({
    queryKey: ["maintenance", "dashboard", "triage", companyId],
    queryFn: () => getMaintenanceInTransitQueue(companyId),
    enabled: Boolean(companyId),
  });
  const severeAlertsQuery = useQuery({
    queryKey: ["maintenance", "dashboard", "severe-alerts", companyId],
    queryFn: () => getMaintenanceSevereAlerts(companyId),
    enabled: Boolean(companyId),
  });
  const recentQuery = useQuery({
    queryKey: ["maintenance", "dashboard", "recent", companyId],
    queryFn: () => getMaintenanceRecentActivity(companyId),
    enabled: Boolean(companyId),
  });
  const workOrdersQuery = useQuery({
    queryKey: ["maintenance", "work-orders", companyId, sourceTypeFilter, externalVendorFilter, locationFilter, bucketFilter],
    queryFn: () =>
      listWorkOrdersFiltered(companyId, {
        source_type: sourceTypeFilter || undefined,
        external_vendor_id: externalVendorFilter || undefined,
        location: locationFilter || undefined,
        bucket: bucketFilter || undefined,
      }),
    enabled: Boolean(companyId),
  });
  const workOrderDetailQuery = useQuery({
    queryKey: ["maintenance", "work-order-detail", companyId, selectedWorkOrderId],
    queryFn: () => getWorkOrder(String(selectedWorkOrderId), companyId),
    enabled: Boolean(companyId && selectedWorkOrderId),
  });
  const partsInventoryRowsQuery = useQuery({
    queryKey: ["maintenance", "parts-inventory", companyId],
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
    mutationFn: (args: { id: string; status: "in_progress" | "waiting_parts" | "complete" }) =>
      transitionWorkOrder(args.id, companyId, { new_status: args.status }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["maintenance", "dashboard", "rm-status", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["maintenance", "dashboard", "recent", companyId] }),
      ]);
      pushToast("R&M status updated", "success");
    },
    onError: () => pushToast("Failed to update R&M status", "error"),
  });

  const kpis = useMemo(
    () =>
      kpisQuery.data ?? {
        open_wos: 0,
        in_shop: 0,
        past_due_pm: 0,
        out_of_service: 0,
        open_damage: 0,
        avg_wo_age_days: 0,
        mtd_repair_cost: 0,
        mtd_parts_cost: 0,
        avg_wo_cost: 0,
        top_vendor: null,
        top_failure: null,
        pending_qbo: 0,
        past_due: 0,
        avg_close_days: 0,
        open_dollars: 0,
        tire_alerts: 0,
        pm_due: 0,
        dot_oos: 0,
        in_progress: 0,
        waiting_parts: 0,
        severe_oos: 0,
        road_service: 0,
        parts_low_stock: 0,
      },
    [kpisQuery.data]
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
          return (
            <NavLink
              key={item.id}
              to={target}
              data-maintenance-subtab={item.id}
              className={`pb-0.5 text-xs font-semibold ${
                active ? "border-b-2 border-[#1f2a44] text-[#1f2a44]" : "border-b-2 border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {item.label}
            </NavLink>
          );
        })}
      </SubTabRow>

      <MaintKpiRows kpis={kpis} />
      {/* On the R&M Status Board these three cards move into the right sidebar (compact) below; every
          other tab keeps its existing full-width layout. */}
      {companyId && tab !== "rm_status_board" ? (
        <MaintenancePmCountdownCards rows={pmDueQuery.data?.rows ?? []} loading={pmDueQuery.isLoading} />
      ) : null}
      <IntegrationsStrip pendingQboCount={kpis.pending_qbo} />
      {companyId && tab !== "rm_status_board" ? <MaintenanceAlertsCard operatingCompanyId={companyId} /> : null}
      {companyId && tab !== "rm_status_board" ? <DtcAutoWorkOrdersCard operatingCompanyId={companyId} /> : null}

      {tab === "active_wos" ? (
        <WorkOrdersTable
          rows={workOrdersQuery.data?.work_orders ?? []}
          loading={workOrdersQuery.isPending || (workOrdersQuery.isFetching && (workOrdersQuery.data?.work_orders?.length ?? 0) === 0)}
          sourceTypeFilter={sourceTypeFilter}
          externalVendorFilter={externalVendorFilter}
          onSourceTypeChange={setSourceTypeFilter}
          onExternalVendorChange={setExternalVendorFilter}
        />
      ) : null}

      {tab === "rm_status_board" ? <RMStatStrip kpis={kpis} /> : null}

      {tab === "rm_status_board" ? (
        // Approved rm-status-board.html: board LEFT + a compact ~168-180px right sidebar with
        // PM Countdown / PM Alerts / DTC / Road Service Active. Single-column stack on small screens.
        <div className="grid grid-cols-1 gap-2 xl:grid-cols-[1fr_180px]">
          <div className="min-w-0">
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
              onAdvanceStatus={(id, status) => statusMutation.mutate({ id, status })}
            />
          </div>
          <aside className="flex flex-col gap-2">
            {companyId ? (
              <MaintenancePmCountdownCards rows={pmDueQuery.data?.rows ?? []} loading={pmDueQuery.isLoading} compact />
            ) : null}
            {companyId ? <MaintenanceAlertsCard operatingCompanyId={companyId} compact /> : null}
            {companyId ? (
              <DtcAutoWorkOrdersCard operatingCompanyId={companyId} compact onOpen={(id) => setSelectedWorkOrderId(id)} />
            ) : null}
            <RoadServiceActivePanel
              roadside={rmStatusQuery.data?.roadside ?? []}
              onOpen={(id) => setSelectedWorkOrderId(id)}
            />
            <InTransitTriageBand
              issues={triageQuery.data?.issues ?? []}
              onTriage={(issue) => setTriageIssue(issue)}
            />
            <SevereAlertsBand alerts={severeAlertsQuery.data?.alerts ?? []} />
          </aside>
        </div>
      ) : null}

      {tab === "fleet_table" ? <FleetTablePage operatingCompanyId={companyId} showMaintenanceColumns /> : null}

      {tab === "service_location" ? <ServiceLocationPage operatingCompanyId={companyId} /> : null}

      {tab === "arriving_soon" ? <ArrivingSoonPage operatingCompanyId={companyId} /> : null}

      {tab === "in_transit_issues"
        ? triageQuery.isError
          ? (
            <div className="rounded-sm border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <div className="font-semibold">Failed to load in-transit issues</div>
              <button
                type="button"
                className="mt-2 rounded-sm border border-red-300 bg-white px-2 py-1 text-xs font-semibold text-red-700"
                onClick={() => {
                  void triageQuery.refetch();
                  pushToast("Retrying in-transit issue load", "info");
                }}
              >
                Retry
              </button>
            </div>
            )
          : (
            <InTransitIssuesTable issues={triageQuery.data?.issues ?? []} onTriage={(issue) => setTriageIssue(issue)} />
            )
        : null}

      {/* Damage Reports = the FORMAL register (safety.incidents, read-only). The driver-PWA intake queue
          moved to its own "Driver Reports" tab below — additive, nothing removed. */}
      {tab === "damage_reports" ? <MaintenanceDamageRegisterTab operatingCompanyId={companyId} /> : null}

      {tab === "driver_reports" ? <DriverReportsQueuePage /> : null}

      {tab === "severe_repairs" ? <SevereRepairOosTab operatingCompanyId={companyId} /> : null}

      {tab === "road_service" ? <RoadServiceList operatingCompanyId={companyId} /> : null}

      {tab === "brake_wear" ? <BrakeWearDashboard /> : null}

      {tab === "tire_wear" ? <TireWearDashboard /> : null}

      {tab === "pre_flight_dvir" ? <PreFlightDvirQueue /> : null}

      {tab === "parts_inventory" ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            <div className="rounded-sm border border-gray-200 bg-white px-2 py-1 text-[11px]">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">Total Parts</div>
              <div className="font-semibold">{partsInventoryKpisQuery.data?.total_parts ?? 0}</div>
            </div>
            <div className="rounded-sm border border-gray-200 bg-white px-2 py-1 text-[11px]">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">Low Stock</div>
              <div className="font-semibold">{partsInventoryKpisQuery.data?.low_stock_count ?? 0}</div>
            </div>
            <div className="rounded-sm border border-gray-200 bg-white px-2 py-1 text-[11px]">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">Total Inventory Value</div>
              <div className="font-semibold">
                ${Number(partsInventoryKpisQuery.data?.total_inventory_value ?? 0).toLocaleString()}
              </div>
            </div>
          </div>
          <PartsInventoryTable companyId={companyId} rows={partsInventoryRowsQuery.data ?? []} />
          <div className="rounded-sm border border-gray-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Parts Inventory Reorder Flags</h3>
              <div className="text-xs text-gray-500">Canonical: maintenance.parts_inventory</div>
            </div>
            {partsReorderQuery.isError ? (
              <div className="rounded-sm border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">
                Reorder list endpoint unavailable in this environment.
              </div>
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

      <RecentActivityRow
        recent={recentQuery.data?.recent ?? []}
        completed={recentQuery.data?.completed ?? []}
        onOpen={(id) => setSelectedWorkOrderId(id)}
      />

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
        workOrder={(workOrderDetailQuery.data ?? null) as Record<string, unknown> | null}
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
                description: `${prefillFromIssue.issue_description}\nGPS: ${prefillFromIssue.gps_lat ?? ""},${prefillFromIssue.gps_lng ?? ""} ${prefillFromIssue.gps_label ?? ""}`.trim(),
                repair_location: "mobile_roadside",
                bucket: "roadside",
                class_hint: "Prefilled from triage issue",
              }
            : undefined
        }
        onClose={() => setCreateWoOpen(false)}
        onCreated={async () => {
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
