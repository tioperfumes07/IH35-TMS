import { entityLabel } from "../../lib/entity-label";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getInsuranceCoverageGaps,
  listInsurancePolicies,
  type InsuranceCoverageGapUnit,
  type InsurancePolicy,
} from "../../api/insurance";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { EntityLink } from "../../components/shared/EntityLink";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";

function toDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function daysUntil(value: string) {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Math.floor((toDate(value).getTime() - start.getTime()) / 86400000);
}

function unitLabel(unit: InsuranceCoverageGapUnit) {
  return entityLabel(unit.unit_number, unit.unit_id, "Unit");
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

  const uncoveredColumns = useMemo<ParityColumn<InsuranceCoverageGapUnit>[]>(
    () => [
      { key: "unit_number", label: "Unit", render: (row) => <EntityLink kind="unit" id={row.unit_id} label={unitLabel(row)} /> },
      { key: "missing_types", label: "Missing Required Types", render: (row) => row.missing_types.join(", ") || "all" },
    ],
    [],
  );

  const mismatchedColumns = useMemo<ParityColumn<InsuranceCoverageGapUnit>[]>(
    () => [
      { key: "unit_number", label: "Unit", render: (row) => <EntityLink kind="unit" id={row.unit_id} label={unitLabel(row)} /> },
      { key: "missing_types", label: "Missing Required Types", render: (row) => row.missing_types.join(", ") },
    ],
    [],
  );

  if (!companyId) {
    return <div className="rounded-sm border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">Select an operating company to view coverage gap dashboard.</div>;
  }

  return (
    <div className="space-y-4">
      <header className="rounded-sm border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Coverage Gap Dashboard</h2>
        <p className="mt-1 text-xs text-slate-600">Identify units without coverage, policies approaching expiration, and requirement mismatches.</p>
      </header>

      {coverageGapsQuery.isLoading || policiesQuery.isLoading ? (
        <div className="text-sm text-slate-500">Loading coverage gap dashboard...</div>
      ) : null}

      {coverageGapsQuery.isError || policiesQuery.isError ? (
        <div className="rounded-sm border border-red-200 bg-red-50 p-3 text-sm text-red-700">Failed to load coverage gap dashboard data.</div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-3">
        <article className="rounded-sm border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Policies expiring in 30 days</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{summary.expiring30.length}</p>
        </article>
        <article className="rounded-sm border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Policies expiring in 60 days</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{summary.expiring60.length}</p>
        </article>
        <article className="rounded-sm border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Policies expiring in 90 days</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{summary.expiring90.length}</p>
        </article>
      </section>

      <section className="rounded-sm border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">Units Without Active Coverage</h3>
        <div className="mt-2">
          <ParityTable
            rows={summary.unitsWithoutActiveCoverage}
            columns={uncoveredColumns}
            rowKey={(row) => row.unit_id}
            loading={coverageGapsQuery.isPending || (coverageGapsQuery.isFetching && summary.unitsWithoutActiveCoverage.length === 0)}
            storageKey="insurance-coverage-gap-uncovered"
            emptyText="No uncovered units."
          />
        </div>
      </section>

      <section className="rounded-sm border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">Units With Mismatched Coverage Requirements</h3>
        <div className="mt-2">
          <ParityTable
            rows={summary.unitsWithMismatchedCoverageRequirements}
            columns={mismatchedColumns}
            rowKey={(row) => `${row.unit_id}-mismatch`}
            loading={coverageGapsQuery.isPending || (coverageGapsQuery.isFetching && summary.unitsWithMismatchedCoverageRequirements.length === 0)}
            storageKey="insurance-coverage-gap-mismatched"
            emptyText="No mismatched coverage requirements."
          />
        </div>
      </section>
    </div>
  );
}
