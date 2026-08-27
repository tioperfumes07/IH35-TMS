/**
 * SAF-B31 — Safety Reports.
 *
 * ROOT CAUSE this file replaces: the route `/safety/reports` was registered and linked from
 * SAFETY_TABS_CONFIG, but the component was an 11-line static placeholder that PROMISED
 * "CSA, crash rate, roadside pass rate, OOS, training, and credential reports" and
 * "Export report data to XLSX" while issuing zero queries. Navigating produced prose.
 *
 * Every number on this page now comes from an endpoint that already exists on main:
 *   GET /api/v1/safety/csa-scores/current          routes/safety/csa-scores.ts:163
 *   GET /api/v1/safety/csa-scores                  routes/safety/csa-scores.ts:148
 *   GET /api/v1/safety/dot-inspections/clean-rate  routes/safety/dot-inspections.ts:78
 *   GET /api/v1/safety/reports/:report_id          safety/reports/safety-reports.routes.ts:39
 * All four are entity-scoped server-side. An empty result renders an honest empty state — it is
 * never rendered as a zero, because a fabricated 0 on a safety screen reads as an all-clear.
 *
 * NOT BUILT, ON PURPOSE (no backing endpoint — see api/safety.ts SAF-B31 note):
 *  - crash rate per million miles: no endpoint exposes fleet mileage alongside crash counts.
 *  - training / credential *reports*: per-driver readers exist, no company-wide report endpoint.
 *  - XLSX export: /api/v1/safety/reports/:id/export.xlsx returns a hardcoded stub workbook, so no
 *    control is wired to it. ParityTable's CSV export (real rendered rows) is offered instead.
 * Those claims are stated as "not yet available" rather than faked.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { DrillKpiCard } from "../../../components/layout/DrillKpiCard";
import { ApiError } from "../../../api/client";
import {
  getSafetyInspectionCleanRate,
  getSafetyReportRollup,
  type SafetyReportRollupRow,
} from "../../../api/safety";
import { getCurrentCsaScore, listCsaScores } from "../../../api/safetyV64";
import { CsaHistoryPager } from "../../../components/safety/CsaHistoryPager";
import { ListErrorState } from "../../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { formatDateUS } from "../../../lib/formatDate";
import { PageHeader } from "../../../components/forms/shared/PageHeader";

/** The rollup route accepts any report_id; this one names the activity rollup it actually returns. */
const ACTIVITY_ROLLUP_ID = "safety-activity-rollup";

type CsaScoreRow = Record<string, unknown>;

function toNullableNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Never coerce a missing metric to 0 on a safety screen. */
function metricText(value: number | null, suffix = ""): string {
  return value == null ? "Not recorded" : `${value}${suffix}`;
}

function errorStatus(error: unknown): number {
  return error instanceof ApiError ? error.status : 0;
}

// C8: `to` is REQUIRED — each rollup opens the inspection records it was computed from.
function MetricCard({ label, value, detail, to }: { label: string; value: string; detail: string; to: string }) {
  return <DrillKpiCard size="md" label={label} value={value} hint={detail} to={to} />;
}

export default function SafetyReportsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const enabled = Boolean(companyId);
  const [csaHistoryPage, setCsaHistoryPage] = useState(1);

  const currentCsaQuery = useQuery({
    queryKey: ["saf-b31", "csa-current", companyId],
    queryFn: () => getCurrentCsaScore(companyId),
    enabled,
  });

  const csaHistoryQuery = useQuery({
    queryKey: ["saf-b31", "csa-history", companyId, csaHistoryPage],
    queryFn: () => listCsaScores(companyId, { limit: 50, offset: (csaHistoryPage - 1) * 50 }),
    enabled,
  });

  const cleanRateQuery = useQuery({
    queryKey: ["saf-b31", "clean-rate", companyId],
    queryFn: () => getSafetyInspectionCleanRate(companyId),
    enabled,
  });

  const rollupQuery = useQuery({
    queryKey: ["saf-b31", "activity-rollup", companyId],
    queryFn: () => getSafetyReportRollup(companyId, ACTIVITY_ROLLUP_ID),
    enabled,
  });

  const current = currentCsaQuery.data?.current ?? null;
  const cleanRate = cleanRateQuery.data ?? null;

  useEffect(() => setCsaHistoryPage(1), [companyId]);

  const csaColumns = useMemo<Array<ParityColumn<CsaScoreRow>>>(
    () => [
      { key: "period_start", label: "Period Start", sortable: true, render: (row) => formatDateUS(row.period_start) },
      { key: "period_end", label: "Period End", sortable: true, render: (row) => formatDateUS(row.period_end) },
      {
        key: "total_inspections",
        label: "Inspections",
        sortable: true,
        render: (row) => metricText(toNullableNumber(row.total_inspections)),
      },
      {
        key: "total_violations",
        label: "Internal Inspection Points",
        sortable: true,
        render: (row) => metricText(toNullableNumber(row.total_violations)),
      },
      {
        key: "total_oos",
        label: "Out of Service",
        sortable: true,
        render: (row) => metricText(toNullableNumber(row.total_oos)),
      },
      {
        key: "basic_unsafe_driving",
        label: "Unsafe Driving",
        sortable: true,
        render: (row) => metricText(toNullableNumber(row.basic_unsafe_driving)),
      },
      {
        key: "basic_hos_compliance",
        label: "HOS Compliance",
        sortable: true,
        render: (row) => metricText(toNullableNumber(row.basic_hos_compliance)),
      },
      {
        key: "basic_driver_fitness",
        label: "Driver Fitness",
        sortable: true,
        render: (row) => metricText(toNullableNumber(row.basic_driver_fitness)),
      },
      {
        key: "basic_controlled_substances",
        label: "Controlled Substances",
        sortable: true,
        render: (row) => metricText(toNullableNumber(row.basic_controlled_substances)),
      },
      {
        key: "basic_vehicle_maintenance",
        label: "Vehicle Maintenance",
        sortable: true,
        render: (row) => metricText(toNullableNumber(row.basic_vehicle_maintenance)),
      },
      {
        key: "basic_crash_indicator",
        label: "Crash Indicator",
        sortable: true,
        render: (row) => metricText(toNullableNumber(row.basic_crash_indicator)),
      },
      { key: "computed_by", label: "Computed By", sortable: true, render: (row) => String(row.computed_by ?? "-") },
    ],
    []
  );

  const rollupColumns = useMemo<Array<ParityColumn<SafetyReportRollupRow>>>(
    () => [
      { key: "event_class", label: "Safety Event Class", sortable: true, render: (row) => row.event_class },
      {
        key: "total",
        label: "Recorded Events",
        sortable: true,
        sortValue: (row) => Number(row.total ?? 0),
        render: (row) => String(row.total ?? 0),
      },
    ],
    []
  );

  return (
    <main className="space-y-3" data-testid="safety-reports-page">
      {/* UI-BACK-BUTTON-MISSING-ENTIRELY: see TrainingProgramsPage.tsx sibling comment. */}
      <PageHeader
        title="Safety Reports"
        subtitle="CSA inspection-point rollups, roadside pass rate, out-of-service counts, and recorded safety-event activity for the selected entity."
        breadcrumb={[{ label: "Safety" }, { label: "Reports" }]}
        backHref="/safety"
      />

      {!enabled ? (
        <div className="rounded-sm border border-gray-200 bg-white p-4 text-sm text-slate-700">
          Select an operating company to load its safety reports.
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Roadside Pass Rate"
          to="/safety/dot-inspections"
          value={
            cleanRateQuery.isLoading ? "Loading..." : metricText(toNullableNumber(cleanRate?.clean_rate_percent), "%")
          }
          detail={
            cleanRate
              ? `${cleanRate.clean_inspections} clean of ${cleanRate.total_inspections} inspections, trailing ${cleanRate.trailing_months} months`
              : "safety.dot_inspections, trailing 12 months"
          }
        />
        <MetricCard
          label="Out of Service (latest period)"
          to="/safety/dot-inspections"
          value={currentCsaQuery.isLoading ? "Loading..." : metricText(toNullableNumber(current?.total_oos))}
          detail={current ? `Period ending ${formatDateUS(current.period_end)}` : "No CSA period computed yet"}
        />
        <MetricCard
          label="Internal Inspection Points"
          to="/safety/csa-fmcsa-trend"
          value={currentCsaQuery.isLoading ? "Loading..." : metricText(toNullableNumber(current?.total_violations))}
          detail="Internal rollup, not an FMCSA BASIC percentile"
        />
        <MetricCard
          label="Inspections (latest period)"
          to="/safety/dot-inspections"
          value={currentCsaQuery.isLoading ? "Loading..." : metricText(toNullableNumber(current?.total_inspections))}
          detail={current ? `Computed by ${String(current.computed_by ?? "-")}` : "No CSA period computed yet"}
        />
      </div>

      <div className="rounded-sm border border-gray-200 bg-slate-50 p-3 text-xs text-slate-700">
        Values are IH35 internal inspection-point rollups derived from recorded inspections and scoring history. They are not FMCSA BASIC measures or percentiles. A metric with no recorded
        source reads &quot;Not recorded&quot; and is never displayed as zero.
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-900">CSA Period History</h2>
        {currentCsaQuery.isError ? (
          <ListErrorState
            title="Couldn't load the current CSA period"
            status={errorStatus(currentCsaQuery.error)}
            message={(currentCsaQuery.error as Error)?.message}
            onRetry={() => void currentCsaQuery.refetch()}
          />
        ) : null}
        {csaHistoryQuery.isError ? (
          <ListErrorState
            title="Couldn't load CSA score history"
            status={errorStatus(csaHistoryQuery.error)}
            message={(csaHistoryQuery.error as Error)?.message}
            onRetry={() => void csaHistoryQuery.refetch()}
          />
        ) : (
          <ParityTable<CsaScoreRow>
            columns={csaColumns}
            rows={csaHistoryQuery.data?.csa_scores ?? []}
            rowKey={(row) => String(row.id)}
            loading={csaHistoryQuery.isLoading}
            emptyText="No CSA scores recorded for this entity."
            storageKey="saf-b31-csa-history"
            exportFilename="safety-csa-period-history"
            tableTestId="safety-reports-csa-table"
            pageSize={50}
            hidePager
          />
        )}
        {!csaHistoryQuery.isError ? (
          <CsaHistoryPager
            page={csaHistoryPage}
            pageSize={50}
            totalCount={csaHistoryQuery.data?.total_count ?? 0}
            fetching={csaHistoryQuery.isFetching}
            onPageChange={setCsaHistoryPage}
            testId="safety-reports-csa-server-pager"
          />
        ) : null}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-900">Recorded Safety Activity</h2>
        {rollupQuery.isError ? (
          <ListErrorState
            title="Couldn't load the safety activity rollup"
            status={errorStatus(rollupQuery.error)}
            message={(rollupQuery.error as Error)?.message}
            onRetry={() => void rollupQuery.refetch()}
          />
        ) : (
          <ParityTable<SafetyReportRollupRow>
            columns={rollupColumns}
            rows={rollupQuery.data?.rows ?? []}
            rowKey={(row) => row.event_class}
            loading={rollupQuery.isLoading}
            emptyText="No safety activity recorded for this entity."
            storageKey="saf-b31-safety-activity"
            exportFilename="safety-activity-rollup"
            tableTestId="safety-reports-activity-table"
          />
        )}
      </section>

      <section className="rounded-sm border border-gray-200 bg-white p-3 text-xs text-slate-700">
        <div className="font-semibold text-slate-900">Not yet available as a report</div>
        <ul className="mt-1 list-disc space-y-1 pl-4">
          <li>
            Crash rate per million miles: no reader exposes fleet mileage alongside crash counts. Accident records live on{" "}
            <Link to="/safety/accidents" className="font-semibold text-slate-700 underline">
              Accidents &amp; Incidents
            </Link>
            .
          </li>
          <li>
            Training and credential reports: per-driver readers exist, but there is no company-wide report endpoint. See{" "}
            <Link to="/safety/training/records" className="font-semibold text-slate-700 underline">
              Training Records
            </Link>
            .
          </li>
          <li>
            XLSX export: the server export route currently returns a fixed sample workbook rather than this entity&apos;s
            data, so no XLSX control is offered. Use the Export control on each table above for the rows shown.
          </li>
        </ul>
      </section>
    </main>
  );
}
