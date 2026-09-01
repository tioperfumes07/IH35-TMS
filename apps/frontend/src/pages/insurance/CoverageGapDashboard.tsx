import { entityLabel } from "../../lib/entity-label";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getInsuranceCoverageGaps,
  listInsurancePolicies,
  listInsuranceTypeCatalog,
  type InsuranceCoverageGapUnit,
  type InsuranceCoverageType,
  type InsurancePolicy,
} from "../../api/insurance";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { EntityLink } from "../../components/shared/EntityLink";
import { EntityPicker } from "../../components/parity/EntityPicker";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ListErrorState } from "../../components/ListErrorState";
import { ApiError } from "../../api/client";
import { useSearchParams } from "react-router-dom";
import { insuranceTypeLabel } from "../../lib/insurance-type-label";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { companyToday } from "../../lib/businessDate";

function toDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function daysUntil(value: string) {
  const start = toDate(companyToday());
  return Math.floor((toDate(value).getTime() - start.getTime()) / 86400000);
}

function unitLabel(unit: InsuranceCoverageGapUnit) {
  return entityLabel(unit.unit_number, unit.unit_id, "Unit");
}

type CoverageCell = "covered" | "missing" | "na";
type CoverageFilter = "all" | "covered" | "missing";

function coverageCell(code: InsuranceCoverageType, missing: InsuranceCoverageType[], required: InsuranceCoverageType[]): CoverageCell {
  if (!required.includes(code)) return "na";
  if (missing.includes(code)) return "missing";
  return "covered";
}

function CoverageChip({ status }: { status: CoverageCell }) {
  if (status === "na") {
    return <span className="text-gray-400" data-coverage-cell="na">—</span>;
  }
  if (status === "missing") {
    return (
      <span className="inline-flex rounded-sm border border-red-300 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-800" data-coverage-cell="missing">
        Missing
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-sm border border-gray-400 bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gray-800" data-coverage-cell="covered">
      Covered
    </span>
  );
}

export function CoverageGapDashboard() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [searchParams, setSearchParams] = useSearchParams();
  // LST-F5170 — visible EntityPicker (URL-only clear link is not reverse chrome).
  const deepLinkUnitId = searchParams.get("unit_id") ?? "";
  const [unitPickerId, setUnitPickerId] = useState("");
  useEffect(() => {
    if (deepLinkUnitId) setUnitPickerId(deepLinkUnitId);
  }, [deepLinkUnitId]);
  const setUnitFilter = (next: string) => {
    setUnitPickerId(next);
    const params = new URLSearchParams(searchParams);
    if (next) params.set("unit_id", next);
    else params.delete("unit_id");
    setSearchParams(params, { replace: true });
  };
  const stagedFilters = useStagedListFilters({
    applied: { unitId: unitPickerId },
    empty: { unitId: "" },
    onApply: (next) => setUnitFilter(next.unitId),
  });
  const [coverageFilter, setCoverageFilter] = useState<Record<string, CoverageFilter>>({});

  const unitId = unitPickerId.trim() || deepLinkUnitId || undefined;

  // INSURANCE-1: the uncovered/mismatched lists come from the SAME backend endpoint that feeds the
  // Landing "Coverage Gap Count" KPI (/api/v1/insurance/coverage-gaps), so the rows shown here always
  // sum to that headline number (uncovered + mismatched). Replaces the old per-unit /assets/:id/coverage
  // client fan-out, which 404'd for every fleet unit lacking an mdata.assets mirror row and silently
  // collapsed the whole list to 0 even though units had 0 policies.
  const coverageGapsQuery = useQuery({
    queryKey: ["insurance", "coverage-gap", "gaps", companyId, unitId ?? null],
    enabled: Boolean(companyId),
    queryFn: () => getInsuranceCoverageGaps(companyId, unitId),
  });

  const policiesQuery = useQuery({
    queryKey: ["insurance", "coverage-gap", "policies", companyId],
    enabled: Boolean(companyId),
    queryFn: () => listInsurancePolicies({ operating_company_id: companyId, status: "active" }).then((result) => result.policies),
  });

  const typesQuery = useQuery({
    queryKey: ["insurance", "type-catalog", companyId],
    enabled: Boolean(companyId),
    queryFn: () => listInsuranceTypeCatalog({ operating_company_id: companyId }).then((result) => result.types),
  });

  const typeNameByCode = useMemo(
    () => new Map<string, string>((typesQuery.data ?? []).map((entry) => [entry.code, entry.name])),
    [typesQuery.data],
  );

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

  const requiredTypes = coverageGapsQuery.data?.required_types ?? [];
  const gapRows = useMemo(
    () => [...summary.unitsWithoutActiveCoverage, ...summary.unitsWithMismatchedCoverageRequirements],
    [summary.unitsWithoutActiveCoverage, summary.unitsWithMismatchedCoverageRequirements],
  );

  const catalogCodes = useMemo<InsuranceCoverageType[]>(() => {
    const fromCatalog = (typesQuery.data ?? []).filter((entry) => entry.active).map((entry) => entry.code);
    if (fromCatalog.length > 0) return fromCatalog;
    return requiredTypes;
  }, [typesQuery.data, requiredTypes]);

  const visibleRows = useMemo(() => {
    return gapRows.filter((row) =>
      catalogCodes.every((code) => {
        const wanted = coverageFilter[code] ?? "all";
        if (wanted === "all") return true;
        const cell = coverageCell(code, row.missing_types, requiredTypes);
        return cell === wanted;
      }),
    );
  }, [gapRows, catalogCodes, coverageFilter, requiredTypes]);

  const gapColumns = useMemo<ParityColumn<InsuranceCoverageGapUnit>[]>(() => {
    const unitCol: ParityColumn<InsuranceCoverageGapUnit> = {
      key: "unit_number",
      label: "Unit",
      render: (row) => <EntityLink kind="unit" id={row.unit_id} label={unitLabel(row)} />,
    };
    const typeCols: ParityColumn<InsuranceCoverageGapUnit>[] = catalogCodes.map((code) => ({
      key: code,
      label: insuranceTypeLabel(code, typeNameByCode.get(code)),
      sortValue: (row) => {
        const cell = coverageCell(code, row.missing_types, requiredTypes);
        return cell === "missing" ? 0 : cell === "covered" ? 1 : 2;
      },
      render: (row) => <CoverageChip status={coverageCell(code, row.missing_types, requiredTypes)} />,
    }));
    return [unitCol, ...typeCols];
  }, [catalogCodes, typeNameByCode, requiredTypes]);

  if (!companyId) {
    return <div className="rounded-sm border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">Select an operating company to view coverage gap dashboard.</div>;
  }

  const failedQuery = coverageGapsQuery.isError ? coverageGapsQuery : policiesQuery.isError ? policiesQuery : typesQuery.isError ? typesQuery : null;

  if (failedQuery) {
    return (
      <ListErrorState
        title="Couldn't load coverage gap dashboard"
        status={failedQuery.error instanceof ApiError ? failedQuery.error.status : 0}
        message={(failedQuery.error as Error | null)?.message}
        onRetry={() => {
          void coverageGapsQuery.refetch();
          void policiesQuery.refetch();
          void typesQuery.refetch();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <header className="rounded-sm border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Coverage Gap Dashboard</h2>
        <p className="mt-1 text-xs text-slate-600">
          One column per coverage type from the catalog. Gap count {coverageGapsQuery.data?.coverage_gap_count ?? gapRows.length} must equal units with at least one Missing.
        </p>
        <CollapsedListFilters
          activeFilterCount={unitPickerId ? 1 : 0}
          onApply={stagedFilters.apply}
          onReset={stagedFilters.reset}
          onCancel={stagedFilters.cancel}
          applyDisabled={!stagedFilters.dirty}
          testIdPrefix="coverage-gap"
          dataAttributes={{ "data-coverage-gap-filter-toolbar": "collapsed" }}
          className="mt-3 max-w-sm"
        >
          <div data-testid="coverage-gap-filters">
            <label className="text-[11px] text-slate-600">
              Unit
              <EntityPicker
                kind="unit"
                operatingCompanyId={companyId}
                value={stagedFilters.draft.unitId || null}
                onChange={(next) => stagedFilters.setDraft({ unitId: next ?? "" })}
                allowCreate={false}
                placeholder="All units"
                className="mt-1"
                dataTestId="coverage-gap-filter-unit"
              />
            </label>
          </div>
        </CollapsedListFilters>
      </header>

      {coverageGapsQuery.isLoading || policiesQuery.isLoading || typesQuery.isLoading ? (
        <div className="text-sm text-slate-500">Loading coverage gap dashboard...</div>
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
        <h3 className="text-sm font-semibold text-slate-900">Coverage by type</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {catalogCodes.map((code) => (
            <label key={code} className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
              {insuranceTypeLabel(code, typeNameByCode.get(code))}
              <select
                className="ml-1 h-7 rounded-sm border border-gray-300 bg-white px-1 text-[11px] font-normal normal-case"
                value={coverageFilter[code] ?? "all"}
                onChange={(event) =>
                  setCoverageFilter((prev) => ({ ...prev, [code]: event.target.value as CoverageFilter }))
                }
                aria-label={`Filter ${code}`}
              >
                <option value="all">All</option>
                <option value="covered">Covered</option>
                <option value="missing">Missing</option>
              </select>
            </label>
          ))}
        </div>
        <div className="mt-2" data-testid="kpi-drill-row-count">
          <ParityTable
            rows={visibleRows}
            columns={gapColumns}
            rowKey={(row) => row.unit_id}
            loading={coverageGapsQuery.isPending || (coverageGapsQuery.isFetching && gapRows.length === 0)}
            storageKey="insurance-coverage-gap-by-type"
            emptyText="No coverage-gap units."
            enableColumnResize
            enableColumnReorder
          />
        </div>
      </section>
    </div>
  );
}
