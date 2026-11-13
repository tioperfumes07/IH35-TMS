import { entityLabel } from "../../lib/entity-label";
import { formatQuantityTable } from "../../lib/money";
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
import { EntityMultiSelect } from "../../components/EntityMultiSelect";
import { PageHeader } from "../../components/layout/PageHeader";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { BoardSection } from "../../components/v3/BoardSection";

/** Convert raw missing-type codes to human-readable labels using the catalog map. */
function missingTypeLabels(codes: string[], typeNames: Map<string, string>): string {
  return codes.map((code) => typeNames.get(code) ?? code).join(", ");
}
import { ListErrorState } from "../../components/ListErrorState";
import { ApiError } from "../../api/client";
import { useLocation, useSearchParams } from "react-router-dom";
import { insuranceTypeLabel } from "../../lib/insurance-type-label";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { companyToday } from "../../lib/businessDate";
import { MultiSelectDropdown } from "../../components/forms/MultiSelectDropdown";
import { resolveBackHref } from "../../lib/returnContext";

const COVERAGE_FILTER_OPTIONS = [
  { value: "covered", label: "Covered" },
  { value: "missing", label: "Missing" },
] as const;

/** U12: empty / both → all; single Covered/Missing → exact cell match. */
function coverageFilterMatches(selected: string[] | undefined, cell: CoverageCell): boolean {
  if (!selected || selected.length === 0 || selected.length >= 2) return true;
  return selected[0] === cell;
}
import { InfoPopover } from "../../components/shared/InfoPopover";

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
      <span className="inline-flex rounded-sm border border-red-300 bg-red-50 px-1.5 py-0.5 text-xs font-semibold uppercase text-red-800" data-coverage-cell="missing">
        Missing
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-sm border border-gray-400 bg-white px-1.5 py-0.5 text-xs font-semibold uppercase text-gray-800" data-coverage-cell="covered">
      Covered
    </span>
  );
}

export function CoverageGapDashboard() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pathname } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  // ROUND 8.20 board20 — Home Coverage gaps KPI attaches ?ret=/insurance; Back must honor it.
  const coverageGapBackHref = resolveBackHref({
    searchParams,
    pathname,
    fallback: "/insurance",
  });
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
  const [coverageFilter, setCoverageFilter] = useState<Record<string, string[]>>({});

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
        const cell = coverageCell(code, row.missing_types, requiredTypes);
        return coverageFilterMatches(coverageFilter[code], cell);
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
    const missingTypesCol: ParityColumn<InsuranceCoverageGapUnit> = {
      key: "missing_types",
      label: "Missing types",
      render: (row) => <span className="text-xs text-[#4B5563]">{missingTypeLabels(row.missing_types, typeNameByCode)}</span>,
    };
    return [unitCol, ...typeCols, missingTypesCol];
  }, [catalogCodes, typeNameByCode, requiredTypes]);

  if (!companyId) {
    return (
      <div className="space-y-3" data-testid="coverage-gap-page">
        <PageHeader
          backHref={coverageGapBackHref}
          breadcrumb={["Insurance", "Coverage gaps"]}
          title="Tractor Coverage Gap Dashboard"
          subtitle="Scoped to tractors — trailers are tracked separately on Fleet Covered."
        />
        <BoardSection title="Coverage gaps" testId="coverage-gap-need-company">
          <p className="px-3 py-2 text-xs text-[#4B5563]">Select an operating company to view coverage gap dashboard.</p>
        </BoardSection>
      </div>
    );
  }

  const failedQuery = coverageGapsQuery.isError ? coverageGapsQuery : policiesQuery.isError ? policiesQuery : typesQuery.isError ? typesQuery : null;

  if (failedQuery) {
    return (
      <div className="space-y-3" data-testid="coverage-gap-page">
        <PageHeader
          backHref={coverageGapBackHref}
          breadcrumb={["Insurance", "Coverage gaps"]}
          title="Tractor Coverage Gap Dashboard"
          subtitle="Scoped to tractors — trailers are tracked separately on Fleet Covered."
        />
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
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="coverage-gap-page">
      <PageHeader
        backHref={coverageGapBackHref}
        breadcrumb={["Insurance", "Coverage gaps"]}
        title="Tractor Coverage Gap Dashboard"
        subtitle="Scoped to tractors (fleet units with a Samsara-tracked unit record) — trailers are tracked separately on Fleet Covered."
      />

      <BoardSection
        title="Filters"
        subtitle={`Gap count ${coverageGapsQuery.data?.coverage_gap_count ?? gapRows.length} must equal units with at least one Missing.`}
        headerRight={
          <InfoPopover label="About the coverage gap dashboard">
            One column per coverage type from the catalog. Gap count{" "}
            {coverageGapsQuery.data?.coverage_gap_count ?? gapRows.length} must equal units with at least one Missing.
          </InfoPopover>
        }
        testId="coverage-gap-filters-board"
      >
        <div className="px-3.5 py-2">
          <CollapsedListFilters
            activeFilterCount={unitPickerId ? 1 : 0}
            onApply={stagedFilters.apply}
            onReset={stagedFilters.reset}
            onCancel={stagedFilters.cancel}
            applyDisabled={!stagedFilters.dirty}
            testIdPrefix="coverage-gap"
            dataAttributes={{ "data-coverage-gap-filter-toolbar": "collapsed" }}
            className="max-w-sm"
          >
            <div data-testid="coverage-gap-filters">
              <label className="text-xs text-[#4B5563]">
                Unit
                <EntityMultiSelect
                  kind="unit"
                  operatingCompanyId={companyId}
                  value={stagedFilters.draft.unitId || null}
                  onChange={(next) => stagedFilters.setDraft({ unitId: next ?? "" })}
                  placeholder="All units"
                  className="mt-1"
                  dataTestId="coverage-gap-filter-unit"
                />
              </label>
            </div>
          </CollapsedListFilters>
        </div>
      </BoardSection>

      {coverageGapsQuery.isLoading || policiesQuery.isLoading || typesQuery.isLoading ? (
        <div className="text-xs text-[#6B7280]">Loading coverage gap dashboard...</div>
      ) : null}

      <BoardSection title="Policy expiry window" testId="coverage-gap-expiry-kpis">
        <div className="grid gap-3 px-3.5 py-2 md:grid-cols-3">
          <article className="rounded-sm border border-gray-200 bg-white p-3">
            <p className="text-xs uppercase tracking-wide text-[#6B7280]">Policies expiring in 30 days</p>
            <p className="mt-2 text-page-title font-semibold text-[#0F1219]">{formatQuantityTable(summary.expiring30.length, 0)}</p>
          </article>
          <article className="rounded-sm border border-gray-200 bg-white p-3">
            <p className="text-xs uppercase tracking-wide text-[#6B7280]">Policies expiring in 60 days</p>
            <p className="mt-2 text-page-title font-semibold text-[#0F1219]">{formatQuantityTable(summary.expiring60.length, 0)}</p>
          </article>
          <article className="rounded-sm border border-gray-200 bg-white p-3">
            <p className="text-xs uppercase tracking-wide text-[#6B7280]">Policies expiring in 90 days</p>
            <p className="mt-2 text-page-title font-semibold text-[#0F1219]">{formatQuantityTable(summary.expiring90.length, 0)}</p>
          </article>
        </div>
      </BoardSection>

      {summary.unitsWithoutActiveCoverage.length > 0 ? (
        <BoardSection title="Units without active coverage" testId="coverage-gap-units-without">
          <ul className="space-y-1 px-3.5 py-2">
            {summary.unitsWithoutActiveCoverage.slice(0, 10).map((row) => (
              <li key={row.unit_id} className="text-xs text-[#4B5563]">
                <EntityLink kind="unit" id={row.unit_id} label={unitLabel(row)} /> — {missingTypeLabels(row.missing_types, typeNameByCode)}
              </li>
            ))}
          </ul>
        </BoardSection>
      ) : null}

      <BoardSection title="Coverage by type" testId="coverage-gap-by-type-board">
        <div className="flex flex-wrap gap-2 px-3.5 pt-2">
          {catalogCodes.map((code) => (
            <div key={code} className="text-xs font-semibold uppercase tracking-wide text-[#4B5563]">
              <span className="block">{insuranceTypeLabel(code, typeNameByCode.get(code))}</span>
              <div className="mt-1 normal-case">
                <MultiSelectDropdown
                  label={`Filter ${code}`}
                  options={[...COVERAGE_FILTER_OPTIONS]}
                  selected={coverageFilter[code] ?? []}
                  onChange={(next) => setCoverageFilter((prev) => ({ ...prev, [code]: next }))}
                  allLabel="All"
                  data-testid={`coverage-gap-filter-${code}`}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2" data-testid="kpi-drill-row-count">
          <ParityTable appearance="board"
            title="Units — insurance coverage by type"
            rows={visibleRows}
            columns={gapColumns}
            rowKey={(row) => row.unit_id}
            loading={coverageGapsQuery.isPending || (coverageGapsQuery.isFetching && gapRows.length === 0)}
            storageKey="insurance-coverage-gap-by-type"
            emptyText="No coverage-gap units."
            enableColumnResize
            enableColumnReorder
            tableTestId="coverage-gap-by-type-table"
          />
        </div>
      </BoardSection>
    </div>
  );
}
