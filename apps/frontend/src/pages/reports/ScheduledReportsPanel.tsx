import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  deleteScheduledReport,
  listScheduledReportsV2,
  pauseScheduledReport,
  resumeScheduledReport,
  sendScheduledReportNow,
} from "../../api/scheduled-reports";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useToast } from "../../components/Toast";

export function ScheduledReportsPanel() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const navigate = useNavigate();

  // LV-REPORTS-CUSTOM-SCHEDULER-CANONICAL-SOR-UNMOUNTED (owner-locked SS9.6): this panel used to
  // read the legacy reports.scheduled_reports table (GET /api/v1/reports/scheduled) while the
  // dedicated /reports/scheduled-custom page already read the canonical reporting.scheduled_reports
  // table (GET /api/v1/scheduled-reports) -- SS9.6 names reporting.* canonical for scheduled reports.
  // The two never agreed: this panel always rendered "No custom schedules" (0 rows in the legacy
  // table) while the real count was 6, live-confirmed on prod including a schedule literally named
  // "dispatch-board" -- the exact example the panel's own empty-state text suggested adding. Same
  // query key ("scheduled-reports-v2") as ScheduledReportsPage.tsx so a mutation from either surface
  // invalidates both.
  const listQuery = useQuery({
    queryKey: ["scheduled-reports-v2", companyId],
    queryFn: () => listScheduledReportsV2(companyId),
    enabled: Boolean(companyId),
    retry: false,
  });

  const pauseMut = useMutation({
    mutationFn: (id: string) => pauseScheduledReport(id, companyId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["scheduled-reports-v2"] });
    },
    onError: () => pushToast("Pause failed", "error"),
  });

  const resumeMut = useMutation({
    mutationFn: (id: string) => resumeScheduledReport(id, companyId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["scheduled-reports-v2"] });
    },
    onError: () => pushToast("Resume failed", "error"),
  });

  const sendNowMut = useMutation({
    mutationFn: (id: string) => sendScheduledReportNow(id, companyId),
    onSuccess: () => pushToast("Send now queued", "success"),
    onError: () => pushToast("Send failed", "error"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteScheduledReport(id, companyId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["scheduled-reports-v2"] });
      pushToast("Schedule deactivated", "success");
    },
    onError: () => pushToast("Deactivate failed", "error"),
  });

  const rows = listQuery.data?.rows ?? [];

  return (
    <section className="rounded-sm border-2 border-slate-300 bg-white">
      <div className="flex items-center justify-between border-b border-slate-300 px-3 py-2">
        <h3 className="text-sm font-semibold text-slate-900">
          Custom scheduled reports
        </h3>
        <div className="flex gap-2">
          <button
            type="button"
            className="text-xs font-semibold text-[#1f2a44] hover:underline"
            onClick={() => navigate("/reports/scheduled-custom")}
          >
            + Schedule new
          </button>
          <Link
            to="/reports/scheduled-custom"
            className="text-xs font-semibold text-slate-600 hover:underline"
          >
            Manage
          </Link>
        </div>
      </div>
      <div className="space-y-2 px-3 py-2">
        {listQuery.isError ? (
          // GO-0028: a failed fetch must never render the same "No custom schedules" text as a
          // genuinely empty result -- this exact panel already has a documented prior incident
          // (LV-REPORTS-CUSTOM-SCHEDULER-CANONICAL-SOR-UNMOUNTED) of showing a false empty state
          // while 6 real schedules existed, via a different root cause. Do not reopen that symptom.
          <div className="flex items-center justify-between gap-2 text-xs text-red-700">
            <span>Unable to load scheduled reports.</span>
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => void listQuery.refetch()}
            >
              Retry
            </button>
          </div>
        ) : rows.length === 0 ? (
          <p className="text-xs text-slate-500">
            No custom schedules — add daily dispatch board or AR aging.
          </p>
        ) : null}
        {rows.map((row) => (
          <div
            key={row.id}
            className="rounded-sm border border-slate-100 bg-slate-50 p-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-slate-500">
                  {row.cadence_label}
                </div>
                <div className="mt-0.5 text-xs font-semibold text-slate-800">
                  {row.name}
                </div>
                <div className="text-xs text-slate-600">{row.recipients}</div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <label className="flex items-center gap-1 text-[10px] text-slate-600">
                  <input
                    type="checkbox"
                    checked={row.status === "active"}
                    onChange={(e) =>
                      e.target.checked
                        ? resumeMut.mutate(row.id)
                        : pauseMut.mutate(row.id)
                    }
                  />
                  Active
                </label>
                <button
                  type="button"
                  className="text-[10px] font-semibold text-[#1f2a44] hover:underline"
                  onClick={() => sendNowMut.mutate(row.id)}
                >
                  Send now
                </button>
                <button
                  type="button"
                  className="text-[10px] font-semibold text-red-700 hover:underline"
                  onClick={() => deleteMut.mutate(row.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default ScheduledReportsPanel;
