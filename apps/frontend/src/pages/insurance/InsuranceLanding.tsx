import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getAssetInsuranceCoverage,
  listInsuranceClaims,
  listInsuranceCoiRequests,
  listInsuranceLawsuits,
  listInsurancePolicies,
} from "../../api/insurance";
import { listUnits } from "../../api/mdata";
import { useCompanyContext } from "../../contexts/CompanyContext";

type UnitSummary = {
  id: string;
  unit_code?: string;
  unit_number?: string;
};

function toDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function daysUntil(value: string) {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Math.floor((toDate(value).getTime() - start.getTime()) / 86400000);
}

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

  const policiesQuery = useQuery({
    queryKey: ["insurance", "landing", "policies", companyId],
    enabled: Boolean(companyId),
    queryFn: () => listInsurancePolicies({ operating_company_id: companyId }).then((result) => result.policies),
  });

  const claimsQuery = useQuery({
    queryKey: ["insurance", "landing", "claims", companyId],
    enabled: Boolean(companyId),
    queryFn: () => listInsuranceClaims({ operating_company_id: companyId }).then((result) => result.claims),
  });

  const lawsuitsQuery = useQuery({
    queryKey: ["insurance", "landing", "lawsuits", companyId],
    enabled: Boolean(companyId),
    queryFn: () => listInsuranceLawsuits({ operating_company_id: companyId }).then((result) => result.lawsuits),
  });

  const coiQuery = useQuery({
    queryKey: ["insurance", "landing", "coi", companyId],
    enabled: Boolean(companyId),
    queryFn: () => listInsuranceCoiRequests({ operating_company_id: companyId }).then((result) => result.requests),
  });

  const unitsQuery = useQuery({
    queryKey: ["insurance", "landing", "units", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const response = await listUnits({ operating_company_id: companyId });
      return (response.units as UnitSummary[]).filter((unit) => Boolean(unit.id));
    },
  });

  const coverageByUnitQuery = useQuery({
    queryKey: ["insurance", "landing", "coverage-by-unit", companyId, unitsQuery.data?.length ?? 0],
    enabled: Boolean(companyId && unitsQuery.data && unitsQuery.data.length > 0),
    queryFn: async () => {
      const units = unitsQuery.data ?? [];
      return Promise.all(
        units.map(async (unit) => ({
          unitId: unit.id,
          coverage: await getAssetInsuranceCoverage(unit.id, companyId),
        }))
      );
    },
  });

  const loading =
    policiesQuery.isLoading ||
    claimsQuery.isLoading ||
    lawsuitsQuery.isLoading ||
    coiQuery.isLoading ||
    unitsQuery.isLoading ||
    coverageByUnitQuery.isLoading;

  const metrics = useMemo(() => {
    const policies = policiesQuery.data ?? [];
    const claims = claimsQuery.data ?? [];
    const lawsuits = lawsuitsQuery.data ?? [];
    const coiRequests = coiQuery.data ?? [];
    const activePolicies = policies.filter((policy) => policy.status === "active");
    const policiesExpiringIn30 = activePolicies.filter((policy) => {
      const remaining = daysUntil(policy.expiry_date);
      return remaining >= 0 && remaining <= 30;
    });

    const now = Date.now();
    const recentCoiRequestCount = coiRequests.filter((request) => {
      const requestedAt = new Date(request.requested_at).getTime();
      return Number.isFinite(requestedAt) && now - requestedAt <= 30 * 86400000;
    }).length;

    const coverageGapCount = (coverageByUnitQuery.data ?? []).filter((row) => row.coverage.gap_types.length > 0).length;

    const openClaimsCount = claims.filter((claim) => claim.status === "open" || claim.status === "investigating").length;
    const openLawsuitsCount = lawsuits.filter((lawsuit) => lawsuit.status === "filed" || lawsuit.status === "active").length;

    return {
      totalActivePolicies: activePolicies.length,
      policiesExpiringIn30: policiesExpiringIn30.length,
      coverageGapCount,
      recentCoiRequestCount,
      openClaimsCount,
      openLawsuitsCount,
    };
  }, [claimsQuery.data, coiQuery.data, coverageByUnitQuery.data, lawsuitsQuery.data, policiesQuery.data]);

  if (!companyId) {
    return <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">Select an operating company to view insurance metrics.</div>;
  }

  return (
    <div className="space-y-4">
      <header className="rounded border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Insurance Dashboard</h2>
        <p className="mt-1 text-xs text-slate-600">Operational snapshot across policies, COI requests, claims, and lawsuits.</p>
      </header>

      {loading ? <div className="text-sm text-slate-500">Loading insurance dashboard...</div> : null}

      {policiesQuery.isError ||
      claimsQuery.isError ||
      lawsuitsQuery.isError ||
      coiQuery.isError ||
      unitsQuery.isError ||
      coverageByUnitQuery.isError ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">Failed to load one or more insurance dashboard widgets.</div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Card label="Total active policies" value={metrics.totalActivePolicies} />
        <Card label="Policies expiring in 30 days" value={metrics.policiesExpiringIn30} />
        <Card label="Coverage gap count" value={metrics.coverageGapCount} />
        <Card label="Recent COI request count" value={metrics.recentCoiRequestCount} />
        <Card label="Open claims count" value={metrics.openClaimsCount} />
        <Card label="Open lawsuits count" value={metrics.openLawsuitsCount} />
      </section>
    </div>
  );
}
