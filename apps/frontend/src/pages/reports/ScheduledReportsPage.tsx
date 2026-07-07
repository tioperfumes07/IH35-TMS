import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteScheduledReport,
  listScheduledReportsV2,
  pauseScheduledReport,
  resumeScheduledReport,
  sendScheduledReportNow,
  type ScheduledReportListRow,
} from "../../api/scheduled-reports";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useToast } from "../../components/Toast";
import { useAuth } from "../../auth/useAuth";
import { ScheduledReportsBackendPendingBanner } from "./ScheduledReportsBackendPendingBanner";
import { ScheduleReportModal } from "./ScheduleReportModal";
import { ReportsSubNav } from "./ReportsSubNav";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";

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

  const columns = useMemo<ParityColumn<ScheduledReportListRow>[]>(
    () => [
      { key: "name", label: "Report", sortable: true, render: (r) => <span className="font-medium">{r.name}</span> },
      { key: "cadence_label", label: "Frequency", sortable: true },
      { key: "recipients", label: "Recipients" },
      { key: "last_run_at", label: "Last run", render: (r) => r.last_run_at?.slice(0, 19) ?? "—" },
      { key: "next_run_at", label: "Next run", render: (r) => r.next_run_at?.slice(0, 19) ?? "—" },
      {
        key: "status",
        label: "Status",
        sortable: true,
        render: (r) => <span className={`rounded-sm border px-2 py-0.5 text-[10px] font-semibold ${statusPill(r.status)}`}>{r.status}</span>,
      },
    ],
    [],
  );

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

      <ParityTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        loading={listQuery.isPending || (listQuery.isFetching && rows.length === 0)}
        storageKey="scheduled-reports"
        emptyText="No schedules yet. Create one when the backend endpoint is live (P6-T11201)."
        rowActions={(r) => (
          <div className="flex flex-wrap justify-end gap-1">
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
          </div>
        )}
      />

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
