import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getInsuranceCoverageGaps,
  listInsurancePolicies,
  type InsuranceCoverageGapUnit,
  type InsurancePolicy,
} from "../../api/insurance";
import { useCompanyContext } from "../../contexts/CompanyContext";

function toDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function daysUntil(value: string) {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Math.floor((toDate(value).getTime() - start.getTime()) / 86400000);
}

function unitLabel(unit: InsuranceCoverageGapUnit) {
  return unit.unit_number || unit.unit_id.slice(0, 8);
}

export function CoverageGapDashboard() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  // INSURANCE-1: the uncovered/mismatched lists come from the SAME backend endpoint that feeds the
  // Landing "Coverage Gap Count" KPI (/api/v1/insurance/coverage-gaps), so the rows shown here always
  // sum to that headline number (uncovered + mismatched). Replaces the old per-unit /assets/:id/coverage
  // client fan-out, which 404'd for every fleet unit lacking an mdata.assets mirror row and silently
  // collapsed the whole list to 0 even though units had 0 policies.
  const coverageGapsQuery = useQuery({
    queryKey: ["insurance", "coverage-gap", "gaps", companyId],
    enabled: Boolean(companyId),
    queryFn: () => getInsuranceCoverageGaps(companyId),
  });

  const policiesQuery = useQuery({
    queryKey: ["insurance", "coverage-gap", "policies", companyId],
    enabled: Boolean(companyId),
    queryFn: () => listInsurancePolicies({ operating_company_id: companyId, status: "active" }).then((result) => result.policies),
  });

  const summary = useMemo(() => {
    const policies = policiesQuery.data ?? [];
    const gaps = coverageGapsQuery.data;

    const expiring = (days: number) =>
      policies.filter((policy: InsurancePolicy) => {
        const remaining = daysUntil(policy.expiry_date);
        return remaining >= 0 && remaining <= days;
      });

    return {
      unitsWithoutActiveCoverage: gaps?.uncovered_units ?? [],
      unitsWithMismatchedCoverageRequirements: gaps?.mismatched_units ?? [],
      expiring30: expiring(30),
      expiring60: expiring(60),
      expiring90: expiring(90),
    };
  }, [coverageGapsQuery.data, policiesQuery.data]);

  if (!companyId) {
    return <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">Select an operating company to view coverage gap dashboard.</div>;
  }

  return (
    <div className="space-y-4">
      <header className="rounded border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Coverage Gap Dashboard</h2>
        <p className="mt-1 text-xs text-slate-600">Identify units without coverage, policies approaching expiration, and requirement mismatches.</p>
      </header>

      {coverageGapsQuery.isLoading || policiesQuery.isLoading ? (
        <div className="text-sm text-slate-500">Loading coverage gap dashboard...</div>
      ) : null}

      {coverageGapsQuery.isError || policiesQuery.isError ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">Failed to load coverage gap dashboard data.</div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-3">
        <article className="rounded border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Policies expiring in 30 days</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{summary.expiring30.length}</p>
        </article>
        <article className="rounded border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Policies expiring in 60 days</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{summary.expiring60.length}</p>
        </article>
        <article className="rounded border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Policies expiring in 90 days</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{summary.expiring90.length}</p>
        </article>
      </section>

      <section className="rounded border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">Units Without Active Coverage</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-gray-50 text-slate-600">
              <tr>
                <th className="px-2 py-1.5 font-semibold">Unit</th>
                <th className="px-2 py-1.5 font-semibold">Missing Required Types</th>
              </tr>
            </thead>
            <tbody>
              {summary.unitsWithoutActiveCoverage.map((row) => (
                <tr key={row.unit_id} className="border-t border-gray-100">
                  <td className="px-2 py-1.5 text-slate-700">{unitLabel(row)}</td>
                  <td className="px-2 py-1.5 text-slate-700">{row.missing_types.join(", ") || "all"}</td>
                </tr>
              ))}
              {summary.unitsWithoutActiveCoverage.length === 0 && !coverageGapsQuery.isLoading ? (
                <tr>
                  <td colSpan={2} className="px-2 py-3 text-center text-slate-500">
                    No uncovered units.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">Units With Mismatched Coverage Requirements</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-gray-50 text-slate-600">
              <tr>
                <th className="px-2 py-1.5 font-semibold">Unit</th>
                <th className="px-2 py-1.5 font-semibold">Missing Required Types</th>
              </tr>
            </thead>
            <tbody>
              {summary.unitsWithMismatchedCoverageRequirements.map((row) => (
                <tr key={`${row.unit_id}-mismatch`} className="border-t border-gray-100">
                  <td className="px-2 py-1.5 text-slate-700">{unitLabel(row)}</td>
                  <td className="px-2 py-1.5 text-slate-700">{row.missing_types.join(", ")}</td>
                </tr>
              ))}
              {summary.unitsWithMismatchedCoverageRequirements.length === 0 && !coverageGapsQuery.isLoading ? (
                <tr>
                  <td colSpan={2} className="px-2 py-3 text-center text-slate-500">
                    No mismatched coverage requirements.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
