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
  listPartsInventory,
} from "../../api/maintenance";
import { PageHeader } from "../../components/layout/PageHeader";
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
import { PartsInventoryTable } from "./components/PartsInventoryTable";

export function MaintenanceHomePage() {
  const { selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const companyId = selectedCompanyId ?? "";
  const [createWoOpen, setCreateWoOpen] = useState(false);
  const [createWoType, setCreateWoType] = useState<WorkOrderType>("pm");
  const [prefillFromIssue, setPrefillFromIssue] = useState<InTransitIssue | null>(null);
  const [triageIssue, setTriageIssue] = useState<InTransitIssue | null>(null);
  const [subnav, setSubnav] = useState<"Maintenance" | "Parts Inventory">("Maintenance");

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
  const partsInventoryQuery = useQuery({
    queryKey: ["maintenance", "parts-inventory", companyId],
    queryFn: () => listPartsInventory(companyId),
    enabled: Boolean(companyId) && subnav === "Parts Inventory",
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
          />
        }
      />

      <div className="overflow-x-auto rounded bg-[#1A1F36] px-2 py-1 text-[11px] text-white">
        <div className="flex min-w-max gap-4">
          {["Maintenance", "Work Orders ▾", "R&M Status", "Service / Location", "Fleet by Type", "PM Schedule", "In-Transit Issues", "Damage Reports"].map((item) => (
            <button
              key={item}
              type="button"
              className={
                (item === "Maintenance" && subnav === "Maintenance") || (item === "Parts Inventory" && subnav === "Parts Inventory")
                  ? "border-b border-white pb-0.5 font-semibold"
                  : ""
              }
              onClick={() => {
                if (item === "Maintenance") setSubnav("Maintenance");
                if (item === "Parts Inventory") setSubnav("Parts Inventory");
              }}
            >
              {item}
            </button>
          ))}
          <button type="button" onClick={() => setSubnav("Parts Inventory")} className={subnav === "Parts Inventory" ? "border-b border-white pb-0.5 font-semibold" : ""}>
            Parts Inventory
          </button>
        </div>
      </div>

      {subnav === "Parts Inventory" ? (
        <PartsInventoryTable companyId={companyId} rows={partsInventoryQuery.data?.rows ?? []} />
      ) : (
        <>
          <MaintKpiRows kpis={kpis} />
          <IntegrationsStrip pendingQboCount={kpis.pending_qbo} />

          <RMBucketsGrid
            inHouse={rmStatusQuery.data?.in_house ?? []}
            external={rmStatusQuery.data?.external ?? []}
            roadside={rmStatusQuery.data?.roadside ?? []}
            onOpen={() => pushToast("WO detail drawer integration is pending follow-up", "info")}
          />

          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            <SevereAlertsBand alerts={severeQuery.data?.alerts ?? []} />
            <InTransitTriageBand issues={triageQuery.data?.issues ?? []} onTriage={(issue) => setTriageIssue(issue)} />
          </div>

          <RecentActivityRow
            recent={recentQuery.data?.recent ?? []}
            completed={recentQuery.data?.completed ?? []}
            onOpen={() => pushToast("WO detail drawer integration is pending follow-up", "info")}
          />
        </>
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
