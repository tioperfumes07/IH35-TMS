import { useQuery } from "@tanstack/react-query";
import { legalMattersApi } from "../../../api/legal-matters";
import { PageHeader } from "../../../components/layout/PageHeader";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { LegalModuleTabs } from "../LegalModuleTabs";
import { formatUsd } from "../../../lib/money";
import { DrillKpiCard } from "../../../components/layout/DrillKpiCard";
import { ListErrorState } from "../../../components/ListErrorState";
import { userFacingApiError } from "../../../lib/api-error-message";

// C8: every legal-report figure opens the matters list it was rolled up from, and a figure the
// payload does not carry renders "—" rather than "$0 at risk" / "0 deadlines".
function Card({ label, value, to }: { label: string; value: string | number | null; to: string }) {
  return <DrillKpiCard size="md" label={label} value={value} to={to} />;
}

/** Absent stays absent. */
function countOrNull(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// Locked palette (§7): no red/orange/yellow section bands — severity is distinguished by neutral
// slate shade intensity only. Red stays reserved for delete/Accident.
const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-slate-800 text-white",
  high: "bg-slate-300 text-slate-900",
  medium: "bg-slate-200 text-slate-700",
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
      <LegalModuleTabs />
      {!companyId ? (
        <p className="text-sm text-gray-600">Select an operating company.</p>
      ) : q.isLoading ? (
        <p className="text-sm text-gray-600">Loading…</p>
      ) : q.isError ? (
        <ListErrorState
          status={0}
          message={userFacingApiError(q.error, "Could not load legal reports.")}
          onRetry={() => void q.refetch()}
        />
      ) : (
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-sm border border-gray-200 bg-white px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-gray-500">Open by severity</div>
            <SeverityChips bySeverity={(s.open_by_severity as Record<string, number>) ?? {}} />
          </div>
          <Card
            label="Amount at risk (open)"
            value={formatUsd(s.total_amount_at_risk as number | string | null | undefined)}
            to="/legal/matters"
          />
          <Card
            label="Amount we seek (plaintiff)"
            value={formatUsd(s.total_amount_we_seek as number | string | null | undefined)}
            to="/legal/matters"
          />
          <Card
            label="Closed matters (count)"
            value={countOrNull(s.total_closed_matters as number | undefined)}
            to="/legal/matters"
          />
          <Card
            label="Avg settled claim"
            value={
              (s.settlement_history as { avg_settled_claim?: string | null })?.avg_settled_claim != null
                ? formatUsd((s.settlement_history as { avg_settled_claim?: string })?.avg_settled_claim)
                : null
            }
            to="/legal/matters"
          />
          <Card label="Deadlines (30d)" value={countOrNull(s.deadlines_next_30_days)} to="/legal/matters" />
          <Card
            label="SOL within 90d"
            value={countOrNull(s.statute_limitations_approaching_90d)}
            to="/legal/matters"
          />
        </div>
      )}
    </div>
  );
}
