import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { closeMonth, getMonthCloseStatus } from "../../api/accounting";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { AccountingSubNav } from "./AccountingSubNav";

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
      const message = String((error as Error).message ?? "Failed to close period");
      if (message.includes("checklist_incomplete")) {
        pushToast("Checklist must be complete before lock.", "info");
        return;
      }
      pushToast(message, "error");
    },
  });

  const checklistRows = useMemo<ChecklistRow[]>(() => {
    const status = statusQuery.data;
    if (!status) return [];
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
        detail: status.ar_aging_review.complete ? "No overdue A/R items." : `${status.ar_aging_review.overdue_count} overdue invoice(s)`,
        href: "/reports/ar-aging",
      },
      {
        id: "ap_aging",
        label: "A/P aging review",
        complete: status.ap_aging_review.complete,
        detail: status.ap_aging_review.complete ? "No overdue A/P items." : `${status.ap_aging_review.overdue_count} overdue bill(s)`,
        href: "/reports/ap-aging",
      },
      {
        id: "fuel_tax",
        label: "Fuel tax filing",
        complete: status.fuel_tax.complete,
        detail: status.fuel_tax.ifta_filed ? "Filing marked complete." : "Filing not marked for selected period.",
        href: "/accounting/sales-tax",
      },
      {
        id: "adjusting_entries",
        label: "Adjusting entries reviewed",
        complete: true,
        detail: `${status.adjusting_entries.count} manual journal entr${status.adjusting_entries.count === 1 ? "y" : "ies"} in period`,
        href: "/accounting/journal-entries",
      },
    ];
  }, [statusQuery.data]);

  const canLock = Boolean(statusQuery.data?.can_lock);

  return (
    <div className="space-y-3">
      <AccountingSubNav />
      <PageHeader title="Month close wizard" subtitle="Review month-end checklist and lock the period only when all required checks are green." />

      {!companyId ? (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Select an operating company before running month close.</p>
      ) : null}

      <div className="grid gap-3 rounded border border-gray-200 bg-white p-3 md:grid-cols-3">
        <label className="text-xs text-gray-600">
          Period
          <input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm" />
        </label>
        <label className="text-xs text-gray-600 md:col-span-2">
          Closing notes (optional)
          <input
            value={closingNotes}
            onChange={(event) => setClosingNotes(event.target.value)}
            placeholder="e.g. month-end review complete, CFO sign-off"
            className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm"
          />
        </label>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
            <tr>
              <th className="px-3 py-2">Checklist item</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Detail</th>
              <th className="px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {statusQuery.isLoading ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-gray-500">
                  Loading checklist...
                </td>
              </tr>
            ) : null}
            {statusQuery.isError ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-red-600">
                  Failed to load month-close checklist.
                </td>
              </tr>
            ) : null}
            {checklistRows.map((row) => (
              <tr key={row.id} className="border-t border-gray-100">
                <td className="px-3 py-2 font-medium text-gray-900">{row.label}</td>
                <td className="px-3 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${row.complete ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                    {row.complete ? "Complete" : "Pending"}
                  </span>
                </td>
                <td className="px-3 py-2 text-gray-700">{row.detail}</td>
                <td className="px-3 py-2">
                  <Link to={row.href} className="text-sm font-medium text-slate-700 hover:underline">
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between rounded border border-gray-200 bg-white px-3 py-3">
        <div className="text-sm text-gray-700">
          {statusQuery.data?.period_status
            ? `Period status: ${statusQuery.data.period_status}`
            : "No accounting period found for this month. Create/open the period before locking."}
        </div>
        <Button disabled={!companyId || !canLock} loading={closeMutation.isPending} onClick={() => closeMutation.mutate()}>
          Close month
        </Button>
      </div>
    </div>
  );
}
