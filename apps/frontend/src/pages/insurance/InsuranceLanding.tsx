import { useQuery } from "@tanstack/react-query";
import { getInsuranceSummary } from "../../api/insurance";
import { useCompanyContext } from "../../contexts/CompanyContext";

function Card({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
    </article>
  );
}

export function InsuranceLanding() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  // Single server-side aggregate (replaces the old 6-query / per-unit-coverage fan-out
  // that left the dashboard fragile and showed "Failed to load widgets").
  const summaryQuery = useQuery({
    queryKey: ["insurance", "landing", "summary", companyId],
    enabled: Boolean(companyId),
    queryFn: () => getInsuranceSummary(companyId).then((result) => result.summary),
  });

  if (!companyId) {
    return <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">Select an operating company to view insurance metrics.</div>;
  }

  const m = summaryQuery.data ?? {
    total_active_policies: 0,
    policies_expiring_30d: 0,
    coverage_gap_count: 0,
    recent_coi_requests: 0,
    open_claims: 0,
    open_lawsuits: 0,
  };

  return (
    <div className="space-y-4">
      <header className="rounded border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Insurance Dashboard</h2>
        <p className="mt-1 text-xs text-slate-600">Operational snapshot across policies, COI requests, claims, and lawsuits.</p>
      </header>

      {summaryQuery.isLoading ? <div className="text-sm text-slate-500">Loading insurance dashboard...</div> : null}

      {summaryQuery.isError ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">Failed to load insurance dashboard widgets.</div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Card label="Total active policies" value={m.total_active_policies} />
        <Card label="Policies expiring in 30 days" value={m.policies_expiring_30d} />
        <Card label="Coverage gap count" value={m.coverage_gap_count} />
        <Card label="Recent COI request count" value={m.recent_coi_requests} />
        <Card label="Open claims count" value={m.open_claims} />
        <Card label="Open lawsuits count" value={m.open_lawsuits} />
      </section>
    </div>
  );
}
