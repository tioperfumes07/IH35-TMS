import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InTransitIssue, WorkOrderType } from "../../api/maintenance";
import {
  convertInTransitIssueToDamage,
  getMaintenanceInTransitQueue,
  getMaintenanceKpis,
  getMaintenanceRecentActivity,
  getMaintenanceRmStatus,
  getWorkOrder,
  listMaintParts,
  listMaintPmDue,
  listPartsInventory,
  listWorkOrdersFiltered,
  transitionWorkOrder,
} from "../../api/maintenance";
import { apiRequest } from "../../api/client";
import { PageHeader } from "../../components/forms/shared/PageHeader";
import { HoverDropdownNav, type NavItem } from "../../components/forms/shared/HoverDropdownNav";
import { SecondaryNavTabs } from "../../components/shared/SecondaryNavTabs";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ArrivingSoonPage } from "./ArrivingSoonPage";
import { DriverReportsQueuePage } from "./DriverReportsQueuePage";
import { FleetTablePage } from "./FleetTablePage";
import { MaintenanceSettingsPage } from "./MaintenanceSettingsPage";
import { ServiceLocationPage } from "./ServiceLocationPage";
import { CreateWorkOrderModal } from "./components/CreateWorkOrderModal";
import { DtcAutoWorkOrdersCard } from "./components/DtcAutoWorkOrdersCard";
import { InTransitTriageBand } from "./components/InTransitTriageBand";
import { IntegrationsStrip } from "./components/IntegrationsStrip";
import { MaintKpiRows } from "./components/MaintKpiRows";
import { MaintenancePmCountdownCards } from "./components/MaintenancePmCountdownCards";
import { MaintenanceAlertsCard } from "./components/MaintenanceAlertsCard";
import { PartsInventoryTable } from "./components/PartsInventoryTable";
import { QuickActionsBar } from "./components/QuickActionsBar";
import { RMBucketsGrid } from "./components/RMBucketsGrid";
import { RecentActivityRow } from "./components/RecentActivityRow";
import { SevereRepairOosTab } from "./components/SevereRepairOosTab";
import { TriageModal } from "./components/TriageModal";
import { WorkOrderDetailModal } from "../../components/work-orders/WorkOrderDetailModal";
import { WorkOrdersTable } from "./components/WorkOrdersTable";

const SUBNAV = [
  { id: "active_wos", label: "Active WOs" },
  { id: "fleet_table", label: "Fleet Table" },
  { id: "rm_status_board", label: "R&M Status Board" },
  { id: "service_location", label: "Service / Location" },
  { id: "arriving_soon", label: "Arriving Soon" },
  { id: "in_transit_issues", label: "In-Transit Issues" },
  { id: "damage_reports", label: "Damage Reports" },
  { id: "severe_repairs", label: "Severe Repairs" },
  { id: "parts_inventory", label: "Parts Inventory" },
  { id: "settings", label: "Settings" },
] as const;

export type MaintenanceTabId = (typeof SUBNAV)[number]["id"];

type Props = {
  initialTab?: MaintenanceTabId;
};

export function MaintenanceHomePage({ initialTab = "active_wos" }: Props) {
  const { selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const companyId = selectedCompanyId ?? "";
  const [createWoOpen, setCreateWoOpen] = useState(false);
  const [createWoType, setCreateWoType] = useState<WorkOrderType>("pm");
  const [prefillFromIssue, setPrefillFromIssue] = useState<InTransitIssue | null>(null);
  const [triageIssue, setTriageIssue] = useState<InTransitIssue | null>(null);
  const [tab, setTab] = useState<MaintenanceTabId>(initialTab);
  const [sourceTypeFilter, setSourceTypeFilter] = useState("");
  const [externalVendorFilter, setExternalVendorFilter] = useState("");
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<string | null>(null);

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
  const recentQuery = useQuery({
    queryKey: ["maintenance", "dashboard", "recent", companyId],
    queryFn: () => getMaintenanceRecentActivity(companyId),
    enabled: Boolean(companyId),
  });
  const workOrdersQuery = useQuery({
    queryKey: ["maintenance", "work-orders", companyId, sourceTypeFilter, externalVendorFilter],
    queryFn: () =>
      listWorkOrdersFiltered(companyId, {
        source_type: sourceTypeFilter || undefined,
        external_vendor_id: externalVendorFilter || undefined,
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
    queryKey: ["maintenance", "maint-pm-due", companyId],
    queryFn: () => listMaintPmDue(companyId),
    enabled: Boolean(companyId),
    retry: false,
  });
  const maintPartsQuery = useQuery({
    queryKey: ["maintenance", "maint-parts", companyId],
    queryFn: () => listMaintParts(companyId),
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
      },
    [kpisQuery.data]
  );

  return (
    <div className="space-y-3">
      <PageHeader
        title="Maintenance"
        subtitle="Work orders, fleet maintenance, parts inventory, and PM scheduling"
        actions={
          <div className="flex items-center gap-2">
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

      <SecondaryNavTabs
        tabs={SUBNAV.map((item) => ({ id: item.id, label: item.label }))}
        activeId={tab}
        onChange={(next) => setTab(next as (typeof SUBNAV)[number]["id"])}
      />

      <MaintKpiRows kpis={kpis} />
      {companyId ? <MaintenancePmCountdownCards rows={pmDueQuery.data?.rows ?? []} loading={pmDueQuery.isLoading} /> : null}
      <IntegrationsStrip pendingQboCount={kpis.pending_qbo} />
      {companyId ? <MaintenanceAlertsCard operatingCompanyId={companyId} /> : null}
      {companyId ? <DtcAutoWorkOrdersCard operatingCompanyId={companyId} /> : null}

      {tab === "active_wos" ? (
        <WorkOrdersTable
          rows={workOrdersQuery.data?.work_orders ?? []}
          sourceTypeFilter={sourceTypeFilter}
          externalVendorFilter={externalVendorFilter}
          onSourceTypeChange={setSourceTypeFilter}
          onExternalVendorChange={setExternalVendorFilter}
        />
      ) : null}

      {tab === "rm_status_board" ? (
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
      ) : null}

      {tab === "fleet_table" ? <FleetTablePage operatingCompanyId={companyId} /> : null}

      {tab === "service_location" ? <ServiceLocationPage operatingCompanyId={companyId} /> : null}

      {tab === "arriving_soon" ? <ArrivingSoonPage operatingCompanyId={companyId} /> : null}

      {tab === "in_transit_issues"
        ? triageQuery.isError
          ? (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <div className="font-semibold">Failed to load in-transit issues</div>
              <button
                type="button"
                className="mt-2 rounded border border-red-300 bg-white px-2 py-1 text-xs font-semibold text-red-700"
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
            <InTransitTriageBand issues={triageQuery.data?.issues ?? []} onTriage={(issue) => setTriageIssue(issue)} />
            )
        : null}

      {tab === "damage_reports" ? <DriverReportsQueuePage /> : null}

      {tab === "severe_repairs" ? <SevereRepairOosTab operatingCompanyId={companyId} /> : null}

      {tab === "parts_inventory" ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            <div className="rounded border border-gray-200 bg-white px-2 py-1 text-[11px]">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">Total Parts</div>
              <div className="font-semibold">{partsInventoryKpisQuery.data?.total_parts ?? 0}</div>
            </div>
            <div className="rounded border border-gray-200 bg-white px-2 py-1 text-[11px]">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">Low Stock</div>
              <div className="font-semibold">{partsInventoryKpisQuery.data?.low_stock_count ?? 0}</div>
            </div>
            <div className="rounded border border-gray-200 bg-white px-2 py-1 text-[11px]">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">Total Inventory Value</div>
              <div className="font-semibold">
                ${Number(partsInventoryKpisQuery.data?.total_inventory_value ?? 0).toLocaleString()}
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <div className="flex gap-2">
              <button type="button" className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-700">
                CSV Import
              </button>
              <button type="button" className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-700">
                + Create
              </button>
            </div>
          </div>
          <PartsInventoryTable companyId={companyId} rows={partsInventoryRowsQuery.data ?? []} />
          <div className="rounded border border-gray-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Maint Parts Reorder Flags</h3>
              <div className="text-xs text-gray-500">From MAINT-12 list contract</div>
            </div>
            {maintPartsQuery.isLoading ? <div className="text-xs text-gray-500">Loading reorder list...</div> : null}
            {maintPartsQuery.isError ? (
              <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">
                Reorder list endpoint unavailable in this environment.
              </div>
            ) : null}
            {!maintPartsQuery.isLoading && !maintPartsQuery.isError ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-500">
                      <th className="px-2 py-1">SKU</th>
                      <th className="px-2 py-1">Part</th>
                      <th className="px-2 py-1">On Hand</th>
                      <th className="px-2 py-1">Reorder Point</th>
                      <th className="px-2 py-1">Flag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(maintPartsQuery.data?.rows ?? []).map((part) => (
                      <tr key={part.id} className="border-t border-gray-100">
                        <td className="px-2 py-1">{part.sku}</td>
                        <td className="px-2 py-1">{part.name}</td>
                        <td className="px-2 py-1">{part.qty_on_hand}</td>
                        <td className="px-2 py-1">{part.reorder_point}</td>
                        <td className="px-2 py-1">
                          {part.needs_reorder ? (
                            <span className="rounded bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">REORDER</span>
                          ) : (
                            <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">OK</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {(maintPartsQuery.data?.rows ?? []).length === 0 ? (
                      <tr>
                        <td className="px-2 py-2 text-gray-500" colSpan={5}>
                          No maint parts found.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            ) : null}
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

export const MAINTENANCE_OPERATION_LINKS: { label: string; path: string }[] = [
  { label: "Dashboard", path: "/maintenance" },
  { label: "Active WOs", path: "/maintenance/active-wos" },
  { label: "Fleet Table", path: "/maintenance/fleet-table" },
  { label: "R&M Status Board", path: "/maintenance/rm-status-board" },
  { label: "Service / Location", path: "/maintenance/service-location" },
  { label: "Arriving Soon", path: "/maintenance/arriving-soon" },
  { label: "In-Transit Issues", path: "/maintenance/in-transit-issues" },
  { label: "Damage Reports", path: "/maintenance/damage-reports" },
  { label: "Severe Repairs", path: "/maintenance/severe-repairs" },
  { label: "Parts Inventory", path: "/maintenance/parts-inventory" },
  { label: "Settings", path: "/maintenance/settings" },
];

export const MAINTENANCE_MASTER_DATA_LINKS: { label: string; path: string }[] = [
  { label: "Vehicles", path: "/maintenance/vehicles" },
  { label: "Parts", path: "/maintenance/parts" },
  { label: "PM Schedule", path: "/maintenance/pm-schedule" },
  { label: "Inspections", path: "/maintenance/inspections" },
  { label: "Vendors", path: "/maintenance/vendors" },
  { label: "Reports", path: "/maintenance/reports" },
  { label: "Compliance", path: "/maintenance/compliance" },
];

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
