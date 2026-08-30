import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { FilingsComplianceDueSection } from "./FilingsComplianceDueSection";
import { FleetHosBoardSection } from "./FleetHosBoardSection";
import { HosTrackerSection } from "./HosTrackerSection";
import { HosViewerSection } from "./HosViewerSection";
import { HosHistorySection } from "./HosHistorySection";
import { RequiredDocumentsSection } from "./RequiredDocumentsSection";
// Reuse the existing HOS Violations list (GET /api/v1/safety/hos-violations, safety.hos_violations) —
// same component the Safety module's own HOS Violations tab renders; wiring the Compliance
// "Violations" tab to it instead of duplicating the fetch+table.
import { HOSViolationsTab } from "../safety/tabs/HOSViolationsTab";
import { SectionErrorBoundary } from "../../components/SectionErrorBoundary";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatDateUS } from "../../lib/formatDate";
import { RelatedModuleLinks } from "../../components/shared/RelatedModuleLinks";
import { Modal } from "../../components/Modal";
import { Button } from "../../components/Button";

// ADDITIVE: "filings" is the module's new overview/home landing tab (owner decision 2026-07-05,
// memory `compliance-taxes-permits-module-org`) — a cross-module "view all pending" rollup. Every
// prior tab (Overview, HOS Tracker/Viewer, Violations, HOS History, Required Documents) is unchanged
// and fully reachable; only the default active tab moves to "filings".
type ComplianceTab = "filings" | "overview" | "hos_tracker" | "hos_viewer" | "violations" | "hos_history" | "required_docs";
const COMPLIANCE_TABS: { id: ComplianceTab; label: string }[] = [
  { id: "filings", label: "Filings & Compliance Due" },
  { id: "overview", label: "Overview" },
  { id: "hos_tracker", label: "HOS Tracker" },
  { id: "hos_viewer", label: "HOS Viewer" },
  { id: "violations", label: "Violations" },
  { id: "hos_history", label: "HOS History" },
  { id: "required_docs", label: "Required Documents" },
];
const COMPLIANCE_TAB_IDS = new Set<string>(COMPLIANCE_TABS.map((t) => t.id));

function parseComplianceTab(raw: string | null): ComplianceTab {
  if (raw && COMPLIANCE_TAB_IDS.has(raw)) return raw as ComplianceTab;
  return "filings";
}

function exportCsv(rows: ComplianceCredential[]) {
  const header = ["type", "owner_type", "owner_name", "expiration_date", "days_until_expiration", "severity"];
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [r.type, r.owner_type, `"${r.owner_name.replace(/"/g, '""')}"`, formatDateUS(r.expiration_date), r.days_until_expiration ?? "", r.severity].join(",")
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [severityFilter, setSeverityFilter] = useState<ComplianceSeverity | null>(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [ownerTypeFilter, setOwnerTypeFilter] = useState("");
  const [ruleError, setRuleError] = useState<string | null>(null);
  const ruleGenerationRef = useRef(0);
  const [ruleCreateOpen, setRuleCreateOpen] = useState(false);
  const [credentialTypeDraft, setCredentialTypeDraft] = useState("cdl");
  const tab = parseComplianceTab(searchParams.get("tab"));

  const setTab = (next: ComplianceTab) => {
    const params = new URLSearchParams(searchParams);
    if (next === "filings") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

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
    mutationFn: (input: { companyId: string; generation: number; credentialType: string }) =>
      createComplianceRule({
        operating_company_id: input.companyId,
        credential_type: input.credentialType,
        entity_scope: "all",
        recipient_emails: [],
        notify_days_before: [30, 14, 7, 1],
        channel: ["email", "in_app"],
      }),
    onMutate: () => setRuleError(null),
    onSuccess: (_result, input) => {
      if (input.generation !== ruleGenerationRef.current) return;
      setRuleCreateOpen(false);
      setCredentialTypeDraft("cdl");
      void queryClient.invalidateQueries({ queryKey: ["compliance-rules", input.companyId] });
    },
    onError: (error, input) => {
      if (input.generation !== ruleGenerationRef.current) return;
      setRuleError(error instanceof Error ? error.message : "Failed to create notification rule");
    },
  });

  const archiveRuleM = useMutation({
    mutationFn: (input: { id: string; companyId: string; generation: number }) =>
      archiveComplianceRule(input.id, input.companyId),
    onMutate: () => setRuleError(null),
    onSuccess: (_result, input) => {
      if (input.generation !== ruleGenerationRef.current) return;
      void queryClient.invalidateQueries({ queryKey: ["compliance-rules", input.companyId] });
    },
    onError: (error, input) => {
      if (input.generation !== ruleGenerationRef.current) return;
      setRuleError(error instanceof Error ? error.message : "Failed to archive notification rule");
    },
  });

  useEffect(() => {
    ruleGenerationRef.current += 1;
    setRuleCreateOpen(false);
    setCredentialTypeDraft("cdl");
    setRuleError(null);
    createRuleM.reset();
    archiveRuleM.reset();
  }, [companyId]);

  const filteredRows = useMemo(() => {
    let rows = dashboardQ.data?.credentials ?? [];
    if (typeFilter) rows = rows.filter((r: ComplianceCredential) => r.type === typeFilter);
    if (ownerTypeFilter) rows = rows.filter((r: ComplianceCredential) => r.owner_type === ownerTypeFilter);
    return rows;
  }, [dashboardQ.data?.credentials, typeFilter, ownerTypeFilter]);
  const overviewQueriesFailed = summaryQ.isError || dashboardQ.isError || rulesQ.isError || logQ.isError;

  if (!companyId) {
    return <div className="rounded-sm border bg-white p-4 text-sm">Select an operating company.</div>;
  }

  return (
    <div className="space-y-6 p-4" data-testid="compliance-dashboard-page">
      <PageHeader
        backHref="/home"
        breadcrumb={["Home", "Compliance"]}
        title="Compliance Dashboard"
        subtitle="Expiring credentials across trucks, trailers, drivers, and carrier"
      />

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

      <RelatedModuleLinks
        testId="compliance-related-module-links"
        links={[
          { label: "Safety HOS", to: "/safety/hos" },
          { label: "DOT Compliance", to: "/safety/dot-compliance" },
          { label: "Form 425C", to: "/425c" },
          { label: "Maintenance Compliance", to: "/maintenance/compliance" },
          { label: "Fuel Compliance", to: "/fuel/compliance" },
          { label: "IFTA Preparer", to: "/reports/ifta-preparer" },
        ]}
      />

      {tab === "filings" ? (
        <SectionErrorBoundary name="Filings & Compliance Due">
          <section data-testid="compliance-section-filings">
            <FilingsComplianceDueSection operatingCompanyId={companyId} />
          </section>
        </SectionErrorBoundary>
      ) : null}

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
        <SectionErrorBoundary name="Violations">
          <section data-testid="compliance-section-violations">
            <HOSViolationsTab />
          </section>
        </SectionErrorBoundary>
      ) : null}
      {tab === "hos_history" ? (
        <SectionErrorBoundary name="HOS History">
          <HosHistorySection operatingCompanyId={companyId} />
        </SectionErrorBoundary>
      ) : null}
      {tab === "required_docs" ? (
        <SectionErrorBoundary name="Required Documents">
          <RequiredDocumentsSection operatingCompanyId={companyId} />
        </SectionErrorBoundary>
      ) : null}

      {tab !== "overview" ? null : (
      <>
      {overviewQueriesFailed ? (
        <ListErrorBanner
          onRetry={() => {
            void summaryQ.refetch();
            void dashboardQ.refetch();
            void rulesQ.refetch();
            void logQ.refetch();
          }}
        />
      ) : null}
      <SectionErrorBoundary name="Live Fleet HOS">
        <FleetHosBoardSection operatingCompanyId={companyId} />
      </SectionErrorBoundary>

      {!overviewQueriesFailed ? (
      <>
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
        {ruleError ? (
          <p role="alert" className="mb-3 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {ruleError}
          </p>
        ) : null}
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
            setCredentialTypeDraft("cdl");
            setRuleCreateOpen(true);
          }}
          onArchive={(id) =>
            archiveRuleM.mutate({ id, companyId, generation: ruleGenerationRef.current })
          }
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
      ) : null}
      </>
      )}

      <Modal variant="drawer" open={ruleCreateOpen} onClose={() => setRuleCreateOpen(false)} title="Create notification rule">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            const credentialType = credentialTypeDraft.trim();
            if (!credentialType) return;
            createRuleM.mutate({ companyId, generation: ruleGenerationRef.current, credentialType });
          }}
        >
          <label className="block text-xs font-medium text-slate-700" htmlFor="compliance-rule-credential-type">
            Credential type
          </label>
          <input
            id="compliance-rule-credential-type"
            className="w-full rounded-sm border border-gray-300 px-2 py-1.5 text-sm"
            value={credentialTypeDraft}
            onChange={(event) => setCredentialTypeDraft(event.target.value)}
            placeholder="cdl or us_insurance"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setRuleCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!credentialTypeDraft.trim()} loading={createRuleM.isPending}>
              Create rule
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
