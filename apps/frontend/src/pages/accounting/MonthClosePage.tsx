import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { acknowledgeMonthCloseChecklist, closeMonth, getMonthCloseStatus } from "../../api/accounting";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { userFacingApiError } from "../../lib/api-error-message";

function currentPeriodIso() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

type ChecklistRow = {
  id: string;
  label: string;
  complete: boolean;
  detail: string;
  href: string;
  ackItem?: "ar_aging_review" | "ap_aging_review";
  canAcknowledge?: boolean;
  reviewed?: boolean;
};

export function MonthClosePage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [period, setPeriod] = useState(currentPeriodIso);
  const [closingNotes, setClosingNotes] = useState("");
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const statusQuery = useQuery({
    queryKey: ["accounting", "month-close", companyId, period],
    queryFn: () => getMonthCloseStatus(companyId, period),
    enabled: Boolean(companyId),
  });

  const closeMutation = useMutation({
    mutationFn: () =>
      closeMonth(companyId, {
        period,
        closing_notes: closingNotes.trim() || undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accounting", "month-close", companyId, period] });
      pushToast("Period locked successfully", "success");
    },
    onError: (error) => {
      const message = userFacingApiError(error, "Failed to close period");
      if (message.includes("checklist_incomplete")) {
        pushToast("Checklist must be complete before lock.", "info");
        return;
      }
      pushToast(message, "error");
    },
  });

  const ackMutation = useMutation({
    mutationFn: (checklistItem: "ar_aging_review" | "ap_aging_review") =>
      acknowledgeMonthCloseChecklist(companyId, { period, checklist_item: checklistItem }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accounting", "month-close", companyId, period] });
      pushToast("Review acknowledged for this period", "success");
    },
    onError: (error) => {
      pushToast(userFacingApiError(error, "Failed to acknowledge review"), "error");
    },
  });

  const periodEnd = statusQuery.data?.period_end ?? "";

  const checklistRows = useMemo<ChecklistRow[]>(() => {
    const status = statusQuery.data;
    if (!status) return [];
    const agingAsOf = periodEnd ? `?as_of=${periodEnd}` : "";
    return [
      {
        id: "bank_recon",
        label: "Bank reconciliation",
        complete: status.bank_recon.complete,
        detail: status.bank_recon.complete
          ? "All period bank accounts are fully matched."
          : `${status.bank_recon.accounts_pending.length} account(s) still pending`,
        href: "/banking/reconciliation",
      },
      {
        id: "ar_aging",
        label: "A/R aging review",
        complete: status.ar_aging_review.complete,
        detail: status.ar_aging_review.overdue_count === 0
          ? "No overdue A/R items."
          : `${status.ar_aging_review.overdue_count} overdue invoice(s) — review required before close`,
        href: `/reports/ar-aging${agingAsOf}`,
        ackItem: "ar_aging_review",
        canAcknowledge: status.ar_aging_review.overdue_count > 0 && !status.ar_aging_review.reviewed,
        reviewed: status.ar_aging_review.reviewed,
      },
      {
        id: "ap_aging",
        label: "A/P aging review",
        complete: status.ap_aging_review.complete,
        detail: status.ap_aging_review.overdue_count === 0
          ? "No overdue A/P items."
          : `${status.ap_aging_review.overdue_count} overdue bill(s) — review required before close`,
        href: `/reports/ap-aging${agingAsOf}`,
        ackItem: "ap_aging_review",
        canAcknowledge: status.ap_aging_review.overdue_count > 0 && !status.ap_aging_review.reviewed,
        reviewed: status.ap_aging_review.reviewed,
      },
      {
        id: "fuel_tax",
        label: "Fuel tax filing (IFTA)",
        complete: status.fuel_tax.complete,
        detail: !status.fuel_tax.due_this_month
          ? `No IFTA filing due this month (${status.fuel_tax.quarter_label} in progress).`
          : status.fuel_tax.ifta_filed
            ? `IFTA ${status.fuel_tax.quarter_label} return filed.`
            : `IFTA ${status.fuel_tax.quarter_label} return not yet filed — required before quarter-end close.`,
        href: "/reports/ifta-preparer",
      },
      {
        id: "adjusting_entries",
        label: "Adjusting entries reviewed",
        complete: true,
        detail: `${status.adjusting_entries.count} manual journal entr${status.adjusting_entries.count === 1 ? "y" : "ies"} in period`,
        href: "/accounting/journal-entries",
      },
    ];
  }, [statusQuery.data, periodEnd]);

  const canLock = Boolean(statusQuery.data?.can_lock);

  const columns: Array<ParityColumn<ChecklistRow>> = [
    { key: "label", label: "Checklist item", alwaysVisible: true, render: (row) => <span className="font-medium text-gray-900">{row.label}</span> },
    {
      key: "complete",
      label: "Status",
      render: (row) => (
        <span className="rounded-sm bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
          {row.complete ? "Complete" : row.reviewed ? "Reviewed" : "Pending"}
        </span>
      ),
    },
    { key: "detail", label: "Detail", render: (row) => <span className="text-gray-700">{row.detail}</span> },
    {
      key: "href",
      label: "Action",
      render: (row) => (
        <div className="flex flex-wrap items-center gap-2">
          <Link to={row.href} className="text-sm font-medium text-slate-700 hover:underline">
            Open
          </Link>
          {row.canAcknowledge && row.ackItem ? (
            <Button
              size="sm"
              variant="secondary"
              loading={ackMutation.isPending}
              onClick={() => ackMutation.mutate(row.ackItem!)}
            >
              Mark reviewed
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <AccountingSubNavWrapper title="Month close wizard" subtitle="Review month-end checklist and lock the period only when all required checks are green.">

      {!companyId ? (
        <p className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">Select an operating company before running month close.</p>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <Link to="/reports/audit/period-close-history" className="font-medium text-slate-700 hover:underline">
          Period close history
        </Link>
        <span className="text-gray-400">·</span>
        <span className="text-gray-600">Overdue A/R or A/P may remain open — accountant marks review before lock (G11-10).</span>
      </div>

      <div className="grid gap-3 rounded-sm border border-gray-200 bg-white p-3 md:grid-cols-3">
        <label className="text-xs text-gray-600">
          Period
          <input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-sm" />
        </label>
        <label className="text-xs text-gray-600 md:col-span-2">
          Closing notes (optional)
          <input
            value={closingNotes}
            onChange={(event) => setClosingNotes(event.target.value)}
            placeholder="e.g. month-end review complete, CFO sign-off"
            className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-sm"
          />
        </label>
      </div>

      {statusQuery.isError ? (
        <p className="rounded-sm border border-gray-200 bg-white px-3 py-4 text-sm text-red-600">Failed to load month-close checklist.</p>
      ) : (
        <ParityTable
          columns={columns}
          rows={checklistRows}
          rowKey={(row) => row.id}
          loading={statusQuery.isLoading}
          storageKey="month-close-checklist"
          emptyText="No checklist items."
        />
      )}

      <div className="flex items-center justify-between rounded-sm border border-gray-200 bg-white px-3 py-3">
        <div className="text-sm text-gray-700">
          {statusQuery.data?.period_status
            ? `Period status: ${statusQuery.data.period_status}`
            : "No accounting period found for this month. Create/open the period before locking."}
        </div>
        <Button disabled={!companyId || !canLock} loading={closeMutation.isPending} onClick={() => closeMutation.mutate()}>
          Close month
        </Button>
      </div>
    </AccountingSubNavWrapper>
  );
}
