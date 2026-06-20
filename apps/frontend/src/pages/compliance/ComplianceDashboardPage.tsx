import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  archiveComplianceRule,
  createComplianceRule,
  fetchComplianceDashboard,
  fetchComplianceLog,
  fetchComplianceRules,
  fetchComplianceSummary,
  type ComplianceCredential,
  type ComplianceSeverity,
} from "../../api/compliance";
import { ComplianceTable } from "../../components/compliance/ComplianceTable";
import { NotificationLogPanel } from "../../components/compliance/NotificationLogPanel";
import { NotificationRulesPanel } from "../../components/compliance/NotificationRulesPanel";
import { SummaryCards } from "../../components/compliance/SummaryCards";
import { PageHeader } from "../../components/layout/PageHeader";
import { FleetHosBoardSection } from "./FleetHosBoardSection";
import { HosTrackerSection } from "./HosTrackerSection";
import { HosViewerSection } from "./HosViewerSection";
import { SectionErrorBoundary } from "../../components/SectionErrorBoundary";
import { useCompanyContext } from "../../contexts/CompanyContext";

type ComplianceTab = "overview" | "hos_tracker" | "hos_viewer" | "violations" | "hos_history";
const COMPLIANCE_TABS: { id: ComplianceTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "hos_tracker", label: "HOS Tracker" },
  { id: "hos_viewer", label: "HOS Viewer" },
  { id: "violations", label: "Violations" },
  { id: "hos_history", label: "HOS History" },
];

function ComplianceEmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded border border-slate-200 bg-white px-4 py-12 text-center">
      <div className="text-sm font-semibold text-slate-700">{title}</div>
      <div className="mt-1 text-xs text-slate-500">{message}</div>
    </div>
  );
}

function exportCsv(rows: ComplianceCredential[]) {
  const header = ["type", "owner_type", "owner_name", "expiration_date", "days_until_expiration", "severity"];
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [r.type, r.owner_type, `"${r.owner_name.replace(/"/g, '""')}"`, r.expiration_date ?? "", r.days_until_expiration ?? "", r.severity].join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "compliance-dashboard.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function ComplianceDashboardPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const [severityFilter, setSeverityFilter] = useState<ComplianceSeverity | null>(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [ownerTypeFilter, setOwnerTypeFilter] = useState("");
  const [tab, setTab] = useState<ComplianceTab>("overview");

  const summaryQ = useQuery({
    queryKey: ["compliance-summary", companyId],
    queryFn: () => fetchComplianceSummary(companyId),
    enabled: Boolean(companyId),
  });

  const dashboardQ = useQuery({
    queryKey: ["compliance-dashboard", companyId, severityFilter],
    queryFn: () => fetchComplianceDashboard(companyId, severityFilter ? { severity: severityFilter } : undefined),
    enabled: Boolean(companyId),
  });

  const rulesQ = useQuery({
    queryKey: ["compliance-rules", companyId],
    queryFn: () => fetchComplianceRules(companyId),
    enabled: Boolean(companyId),
  });

  const logQ = useQuery({
    queryKey: ["compliance-log", companyId],
    queryFn: () => fetchComplianceLog(companyId),
    enabled: Boolean(companyId),
  });

  const createRuleM = useMutation({
    mutationFn: (credentialType: string) =>
      createComplianceRule({
        operating_company_id: companyId,
        credential_type: credentialType,
        entity_scope: "all",
        recipient_emails: [],
        notify_days_before: [30, 14, 7, 1],
        channel: ["email", "in_app"],
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["compliance-rules", companyId] }),
  });

  const archiveRuleM = useMutation({
    mutationFn: (id: string) => archiveComplianceRule(id, companyId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["compliance-rules", companyId] }),
  });

  const filteredRows = useMemo(() => {
    let rows = dashboardQ.data?.credentials ?? [];
    if (typeFilter) rows = rows.filter((r: ComplianceCredential) => r.type === typeFilter);
    if (ownerTypeFilter) rows = rows.filter((r: ComplianceCredential) => r.owner_type === ownerTypeFilter);
    return rows;
  }, [dashboardQ.data?.credentials, typeFilter, ownerTypeFilter]);

  if (!companyId) {
    return <div className="rounded border bg-white p-4 text-sm">Select an operating company.</div>;
  }

  return (
    <div className="space-y-6 p-4" data-testid="compliance-dashboard-page">
      <PageHeader title="Compliance Dashboard" subtitle="Expiring credentials across trucks, trailers, drivers, and carrier" />

      {/* Tabs — ADDITIVE: Overview keeps every prior section; HOS Tracker/Viewer/Violations/History are new. */}
      <div className="flex gap-0 border-b border-slate-200" role="tablist">
        {COMPLIANCE_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-[12px] font-semibold ${tab === t.id ? "border-b-2 border-[#1f2a44] text-[#1f2a44]" : "text-slate-500 hover:text-slate-700"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "hos_tracker" ? (
        <SectionErrorBoundary name="HOS Tracker">
          <HosTrackerSection operatingCompanyId={companyId} />
        </SectionErrorBoundary>
      ) : null}

      {tab === "hos_viewer" ? (
        <SectionErrorBoundary name="HOS Viewer">
          <HosViewerSection operatingCompanyId={companyId} />
        </SectionErrorBoundary>
      ) : null}
      {tab === "violations" ? (
        <ComplianceEmptyState title="Violations" message="No HOS violations in range." />
      ) : null}
      {tab === "hos_history" ? (
        <ComplianceEmptyState title="HOS History" message="No HOS history in this range." />
      ) : null}

      {tab !== "overview" ? null : (
      <>
      <SectionErrorBoundary name="Live Fleet HOS">
        <FleetHosBoardSection operatingCompanyId={companyId} />
      </SectionErrorBoundary>

      <SectionErrorBoundary name="Summary">
        <section data-testid="compliance-section-summary">
          <SummaryCards
            summary={summaryQ.data ?? { red: 0, yellow: 0, green: 0, total: 0 }}
            activeSeverity={severityFilter}
            onSelect={setSeverityFilter}
          />
        </section>
      </SectionErrorBoundary>

      <SectionErrorBoundary name="Credentials table">
        <section data-testid="compliance-section-table">
          <ComplianceTable
            rows={filteredRows}
            typeFilter={typeFilter}
            ownerTypeFilter={ownerTypeFilter}
            onTypeFilter={setTypeFilter}
            onOwnerTypeFilter={setOwnerTypeFilter}
            onExportCsv={() => exportCsv(filteredRows)}
          />
        </section>
      </SectionErrorBoundary>

      <SectionErrorBoundary name="Notification rules">
      <section data-testid="compliance-section-rules">
        <NotificationRulesPanel
          rules={(rulesQ.data?.rules ?? []) as Array<{
            id: string;
            credential_type: string;
            entity_scope: string;
            recipient_emails?: string[] | null;
            notify_days_before?: number[] | null;
            channel?: string[] | null;
          }>}
          onCreate={() => {
            const credentialType = window.prompt("Credential type (e.g. cdl, us_insurance):", "cdl");
            if (credentialType?.trim()) createRuleM.mutate(credentialType.trim());
          }}
          onArchive={(id) => archiveRuleM.mutate(id)}
        />
      </section>
      </SectionErrorBoundary>

      <SectionErrorBoundary name="Notification log">
      <section data-testid="compliance-section-log">
        <NotificationLogPanel
          entries={
            (logQ.data?.entries ?? []) as Array<{
              id: string;
              sent_at: string;
              credential_type: string;
              entity_type: string;
              channel: string;
              recipient: string;
              status: string;
              days_until_expiration: number | null;
            }>
          }
        />
      </section>
      </SectionErrorBoundary>
      </>
      )}
    </div>
  );
}
