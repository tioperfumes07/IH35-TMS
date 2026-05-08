import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { InTransitIssue, WorkOrderType } from "../../api/maintenance";
import {
  convertInTransitIssueToDamage,
  getMaintenanceInTransitQueue,
  getMaintenanceKpis,
  getMaintenanceRecentActivity,
  getMaintenanceRmStatus,
  getMaintenanceSevereAlerts,
  listWorkOrdersFiltered,
} from "../../api/maintenance";
import { PageHeader } from "../../components/layout/PageHeader";
import { SecondaryNavTabs } from "../../components/shared/SecondaryNavTabs";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { CreateWorkOrderModal } from "./components/CreateWorkOrderModal";
import { InTransitTriageBand } from "./components/InTransitTriageBand";
import { IntegrationsStrip } from "./components/IntegrationsStrip";
import { MaintKpiRows } from "./components/MaintKpiRows";
import { QuickActionsBar } from "./components/QuickActionsBar";
import { RMBucketsGrid } from "./components/RMBucketsGrid";
import { RecentActivityRow } from "./components/RecentActivityRow";
import { SevereAlertsBand } from "./components/SevereAlertsBand";
import { TriageModal } from "./components/TriageModal";
import { WorkOrdersTable } from "./components/WorkOrdersTable";
import { ArrivingSoonPage } from "./ArrivingSoonPage";

const SUBNAV = [
  { id: "wo_list", label: "WO List" },
  { id: "fleet_table", label: "Fleet Table" },
  { id: "rm_status", label: "R&M Status" },
  { id: "service_location", label: "Service / Location" },
  { id: "open_damage", label: "Open Damage" },
  { id: "active_wos", label: "Active WOs" },
  { id: "rm_status_board", label: "R&M Status Board" },
  { id: "arriving_soon", label: "Arriving Soon" },
  { id: "in_transit_issues", label: "In-Transit Issues" },
  { id: "damage_reports", label: "Damage Reports" },
  { id: "severe_repairs", label: "Severe Repairs" },
  { id: "parts_inventory", label: "Parts Inventory" },
  { id: "settings", label: "Settings" },
] as const;

type MaintenanceTabId = (typeof SUBNAV)[number]["id"];

function resolveQuickTab(tab: MaintenanceTabId): "wo_list" | "fleet_table" | "rm_status" | "service_location" | "open_damage" {
  if (tab === "active_wos") return "wo_list";
  if (tab === "rm_status_board") return "rm_status";
  if (tab === "damage_reports") return "open_damage";
  if (tab === "fleet_table") return "fleet_table";
  if (tab === "service_location") return "service_location";
  if (tab === "open_damage") return "open_damage";
  return "wo_list";
}

function quickToMainTab(tab: "wo_list" | "fleet_table" | "rm_status" | "service_location" | "open_damage"): MaintenanceTabId {
  if (tab === "wo_list") return "active_wos";
  if (tab === "rm_status") return "rm_status_board";
  if (tab === "open_damage") return "damage_reports";
  return tab;
}

export function MaintenanceHomePage() {
  const { selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const companyId = selectedCompanyId ?? "";
  const [createWoOpen, setCreateWoOpen] = useState(false);
  const [createWoType, setCreateWoType] = useState<WorkOrderType>("pm");
  const [prefillFromIssue, setPrefillFromIssue] = useState<InTransitIssue | null>(null);
  const [triageIssue, setTriageIssue] = useState<InTransitIssue | null>(null);
  const [tab, setTab] = useState<MaintenanceTabId>("active_wos");
  const [sourceTypeFilter, setSourceTypeFilter] = useState("");
  const [externalVendorFilter, setExternalVendorFilter] = useState("");

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
  const severeQuery = useQuery({
    queryKey: ["maintenance", "dashboard", "severe", companyId],
    queryFn: () => getMaintenanceSevereAlerts(companyId),
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
      },
    [kpisQuery.data]
  );

  return (
    <div className="space-y-3">
      <PageHeader
        title="Maintenance Home"
        subtitle="Approved May 2 rebuild + Day 3 triage band"
        actions={
          <QuickActionsBar
            onCreate={(type) => {
              setCreateWoType(type);
              setPrefillFromIssue(null);
              setCreateWoOpen(true);
            }}
            quickTab={resolveQuickTab(tab)}
            onQuickTabChange={(quickTab) => setTab(quickToMainTab(quickTab))}
          />
        }
      />

      <SecondaryNavTabs
        tabs={SUBNAV.map((item) => ({ id: item.id, label: item.label }))}
        activeId={tab}
        onChange={(next) => setTab(next as (typeof SUBNAV)[number]["id"])}
      />

      <MaintKpiRows kpis={kpis} />
      <IntegrationsStrip pendingQboCount={kpis.pending_qbo} />

      {tab === "active_wos" || tab === "wo_list" ? (
        <WorkOrdersTable
          rows={workOrdersQuery.data?.work_orders ?? []}
          sourceTypeFilter={sourceTypeFilter}
          externalVendorFilter={externalVendorFilter}
          onSourceTypeChange={setSourceTypeFilter}
          onExternalVendorChange={setExternalVendorFilter}
        />
      ) : null}

      {tab === "rm_status" || tab === "rm_status_board" ? (
        <RMBucketsGrid
          inHouse={rmStatusQuery.data?.in_house ?? []}
          external={rmStatusQuery.data?.external ?? []}
          roadside={rmStatusQuery.data?.roadside ?? []}
          onOpen={() => pushToast("WO detail drawer integration is pending follow-up", "info")}
        />
      ) : null}

      {tab === "fleet_table" ? (
        <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-500">Fleet table view is in active development.</div>
      ) : null}

      {tab === "service_location" ? (
        <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-500">Service / location board is in active development.</div>
      ) : null}

      {tab === "arriving_soon" ? <ArrivingSoonPage operatingCompanyId={companyId} /> : null}

      {tab === "in_transit_issues" ? (
        <InTransitTriageBand issues={triageQuery.data?.issues ?? []} onTriage={(issue) => setTriageIssue(issue)} />
      ) : null}

      {tab === "damage_reports" || tab === "open_damage" ? (
        <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-500">Damage reports queue is in active development.</div>
      ) : null}

      {tab === "severe_repairs" ? <SevereAlertsBand alerts={severeQuery.data?.alerts ?? []} /> : null}

      {tab === "parts_inventory" ? (
        <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-500">Parts inventory panel is available in the Parts Inventory module components.</div>
      ) : null}

      {tab === "settings" ? (
        <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-500">Maintenance settings are owner/admin scoped and ship in follow-up.</div>
      ) : null}

      <RecentActivityRow
        recent={recentQuery.data?.recent ?? []}
        completed={recentQuery.data?.completed ?? []}
        onOpen={() => pushToast("WO detail drawer integration is pending follow-up", "info")}
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
            pushToast("Issue converted to damage report (stub)", "success");
            setTriageIssue(null);
            await queryClient.invalidateQueries({ queryKey: ["maintenance", "dashboard", "triage", companyId] });
          } catch {
            pushToast("Failed to convert issue to damage report", "error");
          }
        }}
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
