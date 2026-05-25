import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";
import { ReportsSubNav } from "./ReportsSubNav";
import { apiRequest } from "../../api/client";
import { getReportLibrary } from "../../api/reports";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { RunnerFilters, defaultFilterValues } from "./runners/RunnerFilters";
import { RUNNER_CONFIGS, toMonth } from "./runners/runner-config";
import { RunnerTable } from "./runners/RunnerTable";
import { downloadCSV } from "./runners/csv-export";
import { CsaFleetScoreCard } from "./runners/CsaFleetScoreCard";

type RunState = {
  startedAt: number;
  durationMs: number;
  rows: Record<string, unknown>[];
  csaValue: Record<string, unknown> | null;
};

function buildQuery(reportId: string, values: Record<string, unknown>) {
  const q = new URLSearchParams();
  if (reportId === "profit-per-truck") {
    q.set("month", toMonth(values.from));
    if (values.unit_id) q.set("unit_id", String(values.unit_id));
    return q;
  }
  if (reportId === "driver-settlement") {
    if (values.from) q.set("cycle_start", String(values.from));
    if (values.to) q.set("cycle_end", String(values.to));
    return q;
  }
  if (reportId === "driver-pay-history") {
    q.set("driver_id", String(values.driver_id ?? ""));
    if (values.from) q.set("start", String(values.from));
    if (values.to) q.set("end", String(values.to));
    return q;
  }
  if (reportId === "maint-cost-unit") {
    q.set("period", toMonth(values.from));
    return q;
  }
  if (reportId === "fuel-savings") {
    q.set("period", toMonth(values.from));
    return q;
  }
  return q;
}

function responseRows(reportId: string, payload: any): Record<string, unknown>[] {
  if (reportId === "driver-pay-history") return (payload.settlements ?? []) as Record<string, unknown>[];
  if (reportId === "csa-fleet") return [payload as Record<string, unknown>];
  return (payload.rows ?? []) as Record<string, unknown>[];
}

const STUB_PHASE: Record<string, string> = {
  "ar-aging": "Phase 5 accounting module",
  "detention-claims": "Phase 4 detention billing",
};

export function ReportsRunnerPage() {
  const { reportId = "" } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const config = RUNNER_CONFIGS[reportId];
  const [filters, setFilters] = useState<Record<string, unknown>>(defaultFilterValues(config?.filters ?? []));
  const [runState, setRunState] = useState<RunState | null>(null);

  const libraryQuery = useQuery({
    queryKey: ["reports", "library", companyId],
    queryFn: () => getReportLibrary(companyId),
    enabled: Boolean(companyId),
  });
  const reportMeta = libraryQuery.data?.find((item) => item.id === reportId) ?? null;

  const resultRows = useMemo(() => runState?.rows ?? [], [runState]);

  async function logRun(durationMs: number, rowCount: number) {
    try {
      await apiRequest("/api/v1/reports/run-log", {
        method: "POST",
        body: {
          operating_company_id: companyId,
          report_id: reportId,
          report_name: reportMeta?.name ?? reportId,
          filters,
          duration_ms: durationMs,
          rows_returned: rowCount,
        },
      });
    } catch {
      // best effort by design
    }
  }

  async function runReport() {
    if (!config || !companyId) return;
    setIsRunning(true);
    setError(null);
    const startedAt = Date.now();
    try {
      const query = buildQuery(config.id, filters);
      const suffix = query.toString() ? `?${query.toString()}` : "";
      const payload = await apiRequest<any>(`${config.apiPath}${suffix}${suffix ? "&" : "?"}operating_company_id=${encodeURIComponent(companyId)}`);
      const durationMs = Date.now() - startedAt;
      const rows = responseRows(config.id, payload);
      setRunState({
        startedAt,
        durationMs,
        rows,
        csaValue: config.id === "csa-fleet" ? (payload as Record<string, unknown>) : null,
      });
      await logRun(durationMs, rows.length);
    } catch (e) {
      setError("Failed to run report. Please verify filters and retry.");
    } finally {
      setIsRunning(false);
    }
  }

  if (!reportMeta) {
    return (
      <div className="space-y-3">
        <ReportsSubNav />
        <PageHeader title="Report Runner" subtitle="Loading report metadata..." />
      </div>
    );
  }

  if (reportMeta.status === "real" && !config) {
    return (
      <div className="space-y-3">
        <ReportsSubNav />
        <PageHeader title={`Reports / ${reportMeta.name}`} />
        <div className="rounded border border-slate-200 bg-white px-3 py-4 text-sm text-slate-600">Runner configuration is not available yet for this report.</div>
      </div>
    );
  }

  if (reportMeta.status === "stub") {
    return (
      <div className="space-y-3">
        <ReportsSubNav />
        <PageHeader title={`Reports / ${reportMeta.name}`} actions={<button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={() => navigate("/reports")}>Back</button>} />
        <section className="rounded border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-lg font-semibold text-amber-900">Report unavailable in this phase</h2>
          <p className="mt-1 text-sm text-amber-800">
            {reportMeta.description} This runner ships with {STUB_PHASE[reportMeta.id] ?? "a later phase"}.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ReportsSubNav />
      <PageHeader
        title={`← Reports / ${reportMeta.name}`}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700"
              onClick={() => downloadCSV(config.csvFilename(filters), config.columns, resultRows)}
              disabled={resultRows.length === 0}
            >
              Download CSV
            </button>
            <button type="button" className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700" disabled>
              Save
            </button>
          </div>
        }
      />

      <RunnerFilters filters={config.filters} values={filters} onChange={(key, value) => setFilters((curr) => ({ ...curr, [key]: value }))} onRun={runReport} isRunning={isRunning} />

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}{" "}
          <button type="button" className="underline" onClick={runReport}>
            Retry
          </button>
        </div>
      ) : null}

      {isRunning ? (
        <div className="rounded border border-slate-200 bg-white px-3 py-6 text-center text-sm text-slate-500">Running report...</div>
      ) : (
        <section className="space-y-2">
          <div className="text-xs text-slate-500">
            Results ({resultRows.length} rows{runState ? ` · ${(runState.durationMs / 1000).toFixed(1)}s` : ""})
          </div>
          {config.id === "csa-fleet" ? <CsaFleetScoreCard value={runState?.csaValue ?? {}} /> : <RunnerTable columns={config.columns} rows={resultRows} />}
        </section>
      )}
    </div>
  );
}
