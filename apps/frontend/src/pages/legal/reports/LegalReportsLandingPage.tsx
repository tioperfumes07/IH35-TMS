import { useQuery } from "@tanstack/react-query";
import { legalMattersApi } from "../../../api/legal-matters";
import { PageHeader } from "../../../components/layout/PageHeader";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { LegalModuleTabs } from "../LegalModuleTabs";

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-gray-200 bg-white px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-gray-900">{value}</div>
    </div>
  );
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-100 text-red-800",
  high: "bg-orange-100 text-orange-800",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-slate-100 text-slate-700",
};
const SEVERITY_ORDER = ["critical", "high", "medium", "low"] as const;

function SeverityChips({ bySeverity }: { bySeverity: Record<string, number> }) {
  const entries = SEVERITY_ORDER.filter((s) => (bySeverity[s] ?? 0) > 0).map((s) => ({ severity: s, count: bySeverity[s] ?? 0 }));
  if (entries.length === 0) return <span className="text-[13px] text-gray-400">None open</span>;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {entries.map(({ severity, count }) => (
        <span key={severity} className={`rounded px-2 py-0.5 text-[11px] font-semibold capitalize ${SEVERITY_STYLES[severity] ?? "bg-gray-100 text-gray-700"}`}>
          {severity}: {count}
        </span>
      ))}
    </div>
  );
}

export function LegalReportsLandingPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const q = useQuery({
    queryKey: ["legal", "matters", "reports", companyId],
    queryFn: () => legalMattersApi.reportsSummary(companyId),
    enabled: Boolean(companyId),
  });
  const s = q.data ?? {};

  return (
    <div className="space-y-3">
      <PageHeader breadcrumb={["Legal", "Reports"]} title="Legal reports" subtitle="Exposure and deadline rollups" />
      <LegalModuleTabs activeTabId="reports" />
      {!companyId ? (
        <p className="text-sm text-gray-600">Select an operating company.</p>
      ) : q.isLoading ? (
        <p className="text-sm text-gray-600">Loading…</p>
      ) : q.isError ? (
        <p className="text-sm text-red-600">Could not load reports.</p>
      ) : (
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-sm border border-gray-200 bg-white px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-gray-500">Open by severity</div>
            <SeverityChips bySeverity={(s.open_by_severity as Record<string, number>) ?? {}} />
          </div>
          <Card label="Amount at risk (open)" value={String(s.total_amount_at_risk ?? "0")} />
          <Card label="Amount we seek (plaintiff)" value={String(s.total_amount_we_seek ?? "0")} />
          <Card label="Closed matters (count)" value={String((s.settlement_history as { closed_n?: number })?.closed_n ?? 0)} />
          <Card label="Avg settled claim" value={String((s.settlement_history as { avg_settled_claim?: string })?.avg_settled_claim ?? "—")} />
          <Card label="Deadlines (30d)" value={String(s.deadlines_next_30_days ?? 0)} />
          <Card label="SOL within 90d" value={String(s.statute_limitations_approaching_90d ?? 0)} />
        </div>
      )}
    </div>
  );
}
