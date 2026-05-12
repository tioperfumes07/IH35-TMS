import { useQuery } from "@tanstack/react-query";
import { legalMattersApi } from "../../../api/legal-matters";
import { PageHeader } from "../../../components/layout/PageHeader";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { LegalModuleTabs } from "../LegalModuleTabs";

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-gray-200 bg-white px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-gray-900">{value}</div>
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
      <PageHeader title="Legal reports" subtitle="Exposure and deadline rollups" />
      <LegalModuleTabs activeTabId="reports" />
      {!companyId ? (
        <p className="text-sm text-gray-600">Select an operating company.</p>
      ) : q.isLoading ? (
        <p className="text-sm text-gray-600">Loading…</p>
      ) : q.isError ? (
        <p className="text-sm text-red-600">Could not load reports.</p>
      ) : (
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          <Card label="Open by severity (JSON)" value={JSON.stringify(s.open_by_severity ?? {})} />
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
