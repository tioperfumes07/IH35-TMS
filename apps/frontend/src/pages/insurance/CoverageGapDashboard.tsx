import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getAssetInsuranceCoverage,
  listInsurancePolicies,
  type InsuranceAssetCoverage,
  type InsurancePolicy,
} from "../../api/insurance";
import { listUnits } from "../../api/mdata";
import { useCompanyContext } from "../../contexts/CompanyContext";

const REQUIRED_TYPES = ["auto_liability", "physical_damage", "cargo"] as const;

type UnitSummary = {
  id: string;
  unit_code?: string | null;
  unit_number?: string | null;
  status?: string | null;
};

function toDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function daysUntil(value: string) {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Math.floor((toDate(value).getTime() - start.getTime()) / 86400000);
}

function policyIsActiveToday(policy: InsuranceAssetCoverage["coverages"][number]) {
  const today = new Date().toISOString().slice(0, 10);
  return policy.status === "active" && policy.effective_date <= today && policy.expiry_date >= today;
}

function unitLabel(unit: UnitSummary) {
  return unit.unit_code || unit.unit_number || unit.id.slice(0, 8);
}

export function CoverageGapDashboard() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const unitsQuery = useQuery({
    queryKey: ["insurance", "coverage-gap", "units", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const result = await listUnits({ operating_company_id: companyId });
      return (result.units as UnitSummary[]).filter((unit) => Boolean(unit.id));
    },
  });

  const policiesQuery = useQuery({
    queryKey: ["insurance", "coverage-gap", "policies", companyId],
    enabled: Boolean(companyId),
    queryFn: () => listInsurancePolicies({ operating_company_id: companyId, status: "active" }).then((result) => result.policies),
  });

  const coverageByUnitQuery = useQuery({
    queryKey: ["insurance", "coverage-gap", "by-unit", companyId, unitsQuery.data?.length ?? 0],
    enabled: Boolean(companyId && unitsQuery.data && unitsQuery.data.length > 0),
    queryFn: async () => {
      const units = unitsQuery.data ?? [];
      const coverage = await Promise.all(
        units.map(async (unit) => ({
          unit,
          coverage: await getAssetInsuranceCoverage(unit.id, companyId),
        }))
      );
      return coverage;
    },
  });

  const summary = useMemo(() => {
    const policies = policiesQuery.data ?? [];
    const coverageRows = coverageByUnitQuery.data ?? [];

    const expiring = (days: number) =>
      policies.filter((policy: InsurancePolicy) => {
        const remaining = daysUntil(policy.expiry_date);
        return remaining >= 0 && remaining <= days;
      });

    const unitsWithoutActiveCoverage: Array<{ unit: UnitSummary; missing: string[] }> = [];
    const unitsWithMismatchedCoverageRequirements: Array<{ unit: UnitSummary; missing: string[] }> = [];

    for (const row of coverageRows) {
      const activeCoverages = row.coverage.coverages.filter(policyIsActiveToday);
      const activeTypes = new Set(activeCoverages.map((coverage) => coverage.coverage_type));
      const missing = REQUIRED_TYPES.filter((type) => !activeTypes.has(type));

      if (activeCoverages.length === 0) {
        unitsWithoutActiveCoverage.push({ unit: row.unit, missing: [...missing] });
      }
      if (missing.length > 0) {
        unitsWithMismatchedCoverageRequirements.push({ unit: row.unit, missing: [...missing] });
      }
    }

    return {
      unitsWithoutActiveCoverage,
      unitsWithMismatchedCoverageRequirements,
      expiring30: expiring(30),
      expiring60: expiring(60),
      expiring90: expiring(90),
    };
  }, [coverageByUnitQuery.data, policiesQuery.data]);

  if (!companyId) {
    return <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">Select an operating company to view coverage gap dashboard.</div>;
  }

  return (
    <div className="space-y-4">
      <header className="rounded border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Coverage Gap Dashboard</h2>
        <p className="mt-1 text-xs text-slate-600">Identify units without coverage, policies approaching expiration, and requirement mismatches.</p>
      </header>

      {unitsQuery.isLoading || policiesQuery.isLoading || coverageByUnitQuery.isLoading ? (
        <div className="text-sm text-slate-500">Loading coverage gap dashboard...</div>
      ) : null}

      {unitsQuery.isError || policiesQuery.isError || coverageByUnitQuery.isError ? (
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
                <tr key={row.unit.id} className="border-t border-gray-100">
                  <td className="px-2 py-1.5 text-slate-700">{unitLabel(row.unit)}</td>
                  <td className="px-2 py-1.5 text-slate-700">{row.missing.join(", ") || "all"}</td>
                </tr>
              ))}
              {summary.unitsWithoutActiveCoverage.length === 0 && !coverageByUnitQuery.isLoading ? (
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
                <tr key={`${row.unit.id}-mismatch`} className="border-t border-gray-100">
                  <td className="px-2 py-1.5 text-slate-700">{unitLabel(row.unit)}</td>
                  <td className="px-2 py-1.5 text-slate-700">{row.missing.join(", ")}</td>
                </tr>
              ))}
              {summary.unitsWithMismatchedCoverageRequirements.length === 0 && !coverageByUnitQuery.isLoading ? (
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
