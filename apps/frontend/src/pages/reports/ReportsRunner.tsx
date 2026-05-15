import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, apiRequest } from "../../api/client";
import { getReportLibrary, downloadReportExport, scheduleReportExport } from "../../api/reports";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { RunnerFilters, defaultFilterValues } from "./runners/RunnerFilters";
import { RUNNER_CONFIGS, toMonth } from "./runners/runner-config";
import { RunnerTable } from "./runners/RunnerTable";
import { downloadCSV } from "./runners/csv-export";
import { CsaFleetScoreCard } from "./runners/CsaFleetScoreCard";
import { useToast } from "../../components/Toast";

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
  const { pushToast } = useToast();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const config = RUNNER_CONFIGS[reportId];
  const [filters, setFilters] = useState<Record<string, unknown>>(defaultFilterValues(config?.filters ?? []));
  const [runState, setRunState] = useState<RunState | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleFreq, setScheduleFreq] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [scheduleDow, setScheduleDow] = useState(1);
  const [scheduleDom, setScheduleDom] = useState(1);
  const [scheduleEmails, setScheduleEmails] = useState("");
  const [scheduleFmt, setScheduleFmt] = useState<"pdf" | "csv">("csv");
  const [scheduleTime, setScheduleTime] = useState("07:00");

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
          <h2 className="text-lg font-semibold text-amber-900">Coming soon</h2>
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
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700"
              onClick={() => downloadCSV(config.csvFilename(filters), config.columns, resultRows)}
              disabled={resultRows.length === 0}
            >
              Table CSV
            </button>
            <button
              type="button"
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700"
              disabled={!companyId}
              onClick={() => {
                void (async () => {
                  try {
                    await downloadReportExport(reportId, companyId, "csv");
                  } catch {
                    pushToast("Server CSV export failed", "error");
                  }
                })();
              }}
            >
              Download CSV
            </button>
            <button
              type="button"
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700"
              disabled={!companyId}
              onClick={() => {
                void (async () => {
                  try {
                    await downloadReportExport(reportId, companyId, "pdf");
                  } catch (e) {
                    if (e instanceof ApiError && e.status === 501) pushToast("PDF export is not implemented on the server yet.", "info");
                    else pushToast("PDF export failed", "error");
                  }
                })();
              }}
            >
              Download PDF
            </button>
            <button
              type="button"
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700"
              disabled={!companyId}
              onClick={() => setScheduleOpen(true)}
            >
              Schedule email
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

      <Modal open={scheduleOpen} onClose={() => setScheduleOpen(false)} title="Schedule emailed report">
        <div className="space-y-3 text-sm">
          <label className="block">
            Frequency
            <select
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
              value={scheduleFreq}
              onChange={(e) => setScheduleFreq(e.target.value as "daily" | "weekly" | "monthly")}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          {scheduleFreq === "weekly" ? (
            <label className="block">
              Day of week (0=Sun … 6=Sat)
              <input
                type="number"
                min={0}
                max={6}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                value={scheduleDow}
                onChange={(e) => setScheduleDow(Number(e.target.value))}
              />
            </label>
          ) : null}
          {scheduleFreq === "monthly" ? (
            <label className="block">
              Day of month (1–31)
              <input
                type="number"
                min={1}
                max={31}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                value={scheduleDom}
                onChange={(e) => setScheduleDom(Number(e.target.value))}
              />
            </label>
          ) : null}
          <label className="block">
            Send time (local HH:MM)
            <input
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)}
            />
          </label>
          <label className="block">
            Recipients (comma-separated emails)
            <input
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
              value={scheduleEmails}
              onChange={(e) => setScheduleEmails(e.target.value)}
            />
          </label>
          <label className="block">
            Format
            <select
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
              value={scheduleFmt}
              onChange={(e) => setScheduleFmt(e.target.value as "pdf" | "csv")}
            >
              <option value="csv">CSV</option>
              <option value="pdf">PDF</option>
            </select>
          </label>
          <button
            type="button"
            className="rounded bg-slate-900 px-3 py-2 text-white"
            onClick={() => {
              const recipients = scheduleEmails
                .split(/[,;\s]+/)
                .map((s) => s.trim())
                .filter(Boolean);
              void (async () => {
                try {
                  await scheduleReportExport(reportId, {
                    operating_company_id: companyId,
                    frequency: scheduleFreq,
                    time_local: scheduleTime,
                    day_of_week: scheduleFreq === "weekly" ? scheduleDow : undefined,
                    day_of_month: scheduleFreq === "monthly" ? scheduleDom : undefined,
                    recipients,
                    format: scheduleFmt,
                    subject: `${reportMeta.name} (${scheduleFmt.toUpperCase()})`,
                  });
                  pushToast("Schedule saved", "success");
                  setScheduleOpen(false);
                } catch {
                  pushToast("Could not save schedule", "error");
                }
              })();
            }}
          >
            Save schedule
          </button>
        </div>
      </Modal>
    </div>
  );
}
