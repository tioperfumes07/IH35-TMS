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
import { useSearchParams } from "react-router-dom";
import { formatDateTimeUS } from "../../lib/formatDate";

const REPORT_PRESETS: Record<string, { title: string; subtitle: string; reportIds: Set<string> }> = {
  "owner-weekly": {
    title: "Owner weekly pack",
    subtitle: "Saved weekly operations and finance schedules",
    reportIds: new Set(["dispatch-board", "cash-position-ar", "profit-per-truck-week", "settlements-ready", "maintenance-open-wos"]),
  },
  "quarter-close": {
    title: "Quarter close package",
    subtitle: "Saved close-period finance, settlement, and IFTA schedules",
    reportIds: new Set(["cash-position-ar", "profit-per-truck-week", "settlements-ready", "ifta-quarterly-state"]),
  },
};

/** Governed display labels for known scheduled-custom report_id slugs (API id stays raw). */
const REPORT_LABELS: Record<string, string> = {
  "dispatch-board": "Dispatch board",
  "cash-position-ar": "Cash position / A/R",
  "profit-per-truck-week": "Profit per truck (week)",
  "settlements-ready": "Settlements ready",
  "maintenance-open-wos": "Maintenance open WOs",
  "ifta-quarterly-state": "IFTA quarterly by state",
  "cash-flow-overview": "Cash flow overview",
  "settlement-summary": "Settlement summary",
  "customer-profitability": "Customer profitability",
  "profit-per-truck": "Profit per truck",
  "fuel-reconciliation": "Fuel reconciliation",
  "maintenance-cost-per-unit": "Maintenance cost per unit",
  "ar-aging": "A/R aging",
  "ap-aging": "A/P aging",
};

function isSlugLike(value: string, reportId: string): boolean {
  const v = value.trim();
  if (!v) return true;
  if (v === reportId) return true;
  return /^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(v);
}

function humanizeReportSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (["ar", "ap", "wo", "wos", "ifta", "pnl"].includes(lower)) return lower.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function scheduledReportLabel(row: ScheduledReportListRow): string {
  const mapped = REPORT_LABELS[row.report_id];
  const name = (row.name ?? "").trim();
  if (name && !isSlugLike(name, row.report_id)) return name;
  if (mapped) return mapped;
  if (name) return humanizeReportSlug(name);
  return humanizeReportSlug(row.report_id);
}

function scheduledStatusLabel(status: string): "Active" | "Paused" | "Failed" | string {
  if (status === "active") return "Active";
  if (status === "paused") return "Paused";
  if (status === "failed" || status === "error") return "Failed";
  if (!status) return "—";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function scheduledTimestampLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return formatDateTimeUS(value) || "—";
}

function statusPill(status: string) {
  if (status === "active") return "bg-emerald-100 text-emerald-900 border-emerald-200";
  if (status === "paused") return "bg-amber-100 text-amber-900 border-amber-200";
  return "bg-red-100 text-red-900 border-red-200";
}

export function ScheduledReportsPage() {
  const [searchParams] = useSearchParams();
  const preset = REPORT_PRESETS[searchParams.get("preset") ?? ""] ?? null;
  const { selectedCompanyId } = useCompanyContext();
  const { user } = useAuth();
  const companyId = selectedCompanyId ?? "";
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  // SCHEDULED-REPORTS-EDIT-BUTTON-OPENS-BLANK-CREATE-FORM-NOT-EDIT: the row being edited, or null for
  // "+ Schedule a new report" (create mode). Threaded into ScheduleReportModal as `editId`.
  const [editingRow, setEditingRow] = useState<ScheduledReportListRow | null>(null);

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
      pushToast("Deactivated", "success");
    },
    onError: () => pushToast("Deactivate failed", "error"),
  });

  const allRows = listQuery.data?.rows ?? [];
  const rows = preset ? allRows.filter((row) => preset.reportIds.has(row.report_id)) : allRows;

  const columns = useMemo<ParityColumn<ScheduledReportListRow>[]>(
    () => [
      {
        key: "name",
        label: "Report",
        sortable: true,
        sortValue: (r) => scheduledReportLabel(r),
        render: (r) => <span className="font-medium">{scheduledReportLabel(r)}</span>,
      },
      { key: "cadence_label", label: "Frequency", sortable: true },
      { key: "recipients", label: "Recipients" },
      {
        key: "last_run_at",
        label: "Last run",
        render: (r) => scheduledTimestampLabel(r.last_run_at),
      },
      {
        key: "next_run_at",
        label: "Next run",
        render: (r) => scheduledTimestampLabel(r.next_run_at),
      },
      {
        key: "status",
        label: "Status",
        sortable: true,
        render: (r) => (
          <span className={`rounded-sm border px-2 py-0.5 text-[10px] font-semibold ${statusPill(r.status)}`}>
            {scheduledStatusLabel(r.status)}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-4 p-2 md:p-4">
      <ReportsSubNav />
      <PageHeader
        title={preset?.title ?? "Scheduled reports"}
        subtitle={preset?.subtitle ?? "Automated report delivery via email queue"}
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditingRow(null);
              setModalOpen(true);
            }}
            disabled={!companyId}
          >
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
        emptyText={preset ? `No ${preset.title.toLowerCase()} schedules exist for this company.` : "No schedules yet. Create one when the backend endpoint is live (P6-T11201)."}
        rowActions={(r) => (
          <div className="flex flex-wrap justify-end gap-1">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setEditingRow(r);
                setModalOpen(true);
              }}
            >
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
              Deactivate
            </Button>
          </div>
        )}
      />

      <ScheduleReportModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingRow(null);
        }}
        operatingCompanyId={companyId}
        defaultEmail={user?.email ?? ""}
        editId={editingRow?.id ?? null}
        onCreated={() => void qc.invalidateQueries({ queryKey: ["scheduled-reports-v2"] })}
      />
    </div>
  );
}
