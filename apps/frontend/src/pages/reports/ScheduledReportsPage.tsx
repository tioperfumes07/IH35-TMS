import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteScheduledReport,
  listScheduledReportsV2,
  pauseScheduledReport,
  resumeScheduledReport,
  sendScheduledReportNow,
} from "../../api/scheduled-reports";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useToast } from "../../components/Toast";
import { useAuth } from "../../auth/useAuth";
import { ScheduledReportsBackendPendingBanner } from "./ScheduledReportsBackendPendingBanner";
import { ScheduleReportModal } from "./ScheduleReportModal";
import { ReportsSubNav } from "./ReportsSubNav";

function statusPill(status: string) {
  if (status === "active") return "bg-emerald-100 text-emerald-900 border-emerald-200";
  if (status === "paused") return "bg-amber-100 text-amber-900 border-amber-200";
  return "bg-red-100 text-red-900 border-red-200";
}

export function ScheduledReportsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const { user } = useAuth();
  const companyId = selectedCompanyId ?? "";
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);

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
      pushToast("Paused", "success");
    },
    onError: () => pushToast("Pause failed", "error"),
  });

  const resumeMut = useMutation({
    mutationFn: (id: string) => resumeScheduledReport(id, companyId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["scheduled-reports-v2"] });
      pushToast("Resumed", "success");
    },
    onError: () => pushToast("Resume failed", "error"),
  });

  const sendMut = useMutation({
    mutationFn: (id: string) => sendScheduledReportNow(id, companyId),
    onSuccess: () => pushToast("Send now queued", "success"),
    onError: () => pushToast("Send failed", "error"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteScheduledReport(id, companyId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["scheduled-reports-v2"] });
      pushToast("Deleted", "success");
    },
    onError: () => pushToast("Delete failed", "error"),
  });

  const rows = listQuery.data?.rows ?? [];

  return (
    <div className="space-y-4 p-2 md:p-4">
      <ReportsSubNav />
      <PageHeader
        title="Scheduled reports"
        subtitle="Automated report delivery via email queue"
        actions={
          <Button size="sm" onClick={() => setModalOpen(true)} disabled={!companyId}>
            Schedule a new report
          </Button>
        }
      />
      {!companyId ? <p className="text-sm text-red-600">Select an operating company.</p> : null}
      {listQuery.isError ? <ScheduledReportsBackendPendingBanner error={listQuery.error} onRetry={() => void listQuery.refetch()} /> : null}
      {listQuery.isLoading ? <p className="text-sm text-gray-500">Loading schedules…</p> : null}

      <div className="overflow-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-gray-50 text-[11px] font-semibold uppercase text-gray-600">
            <tr>
              <th className="px-2 py-2">Report</th>
              <th className="px-2 py-2">Frequency</th>
              <th className="px-2 py-2">Recipients</th>
              <th className="px-2 py-2">Last run</th>
              <th className="px-2 py-2">Next run</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-gray-100">
                <td className="px-2 py-2 font-medium">{r.name}</td>
                <td className="px-2 py-2">{r.cadence_label}</td>
                <td className="px-2 py-2">{r.recipients}</td>
                <td className="px-2 py-2">{r.last_run_at?.slice(0, 19) ?? "—"}</td>
                <td className="px-2 py-2">{r.next_run_at?.slice(0, 19) ?? "—"}</td>
                <td className="px-2 py-2">
                  <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${statusPill(r.status)}`}>{r.status}</span>
                </td>
                <td className="space-x-1 px-2 py-2">
                  <Button size="sm" variant="secondary" onClick={() => setModalOpen(true)}>
                    Edit
                  </Button>
                  {r.status === "active" ? (
                    <Button size="sm" variant="secondary" loading={pauseMut.isPending} onClick={() => pauseMut.mutate(r.id)}>
                      Pause
                    </Button>
                  ) : (
                    <Button size="sm" variant="secondary" loading={resumeMut.isPending} onClick={() => resumeMut.mutate(r.id)}>
                      Resume
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" loading={sendMut.isPending} onClick={() => sendMut.mutate(r.id)}>
                    Send now
                  </Button>
                  <Button size="sm" variant="secondary" loading={delMut.isPending} onClick={() => delMut.mutate(r.id)}>
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && listQuery.isSuccess ? (
              <tr>
                <td colSpan={7} className="px-2 py-6 text-center text-gray-500">
                  No schedules yet. Create one when the backend endpoint is live (P6-T11201).
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <ScheduleReportModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        operatingCompanyId={companyId}
        defaultEmail={user?.email ?? ""}
        onCreated={() => void qc.invalidateQueries({ queryKey: ["scheduled-reports-v2"] })}
      />
    </div>
  );
}
