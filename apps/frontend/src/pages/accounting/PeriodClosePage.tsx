import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { closeAccountingPeriod, createAccountingPeriod, reopenAccountingPeriod } from "../../api/accounting-wave2";
import { PageHeader } from "../../components/layout/PageHeader";
import { ActionButton } from "../../components/shared/ActionButton";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";

/** Period list GET is not in Wave 2 routes yet — create / close / reopen are wired. */
export function PeriodClosePage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [fy, setFy] = useState(String(new Date().getFullYear()));
  const [label, setLabel] = useState("");
  const [closeId, setCloseId] = useState("");
  const [reopenId, setReopenId] = useState("");
  const [reopenReason, setReopenReason] = useState("");

  const createMut = useMutation({
    mutationFn: () =>
      createAccountingPeriod({
        operating_company_id: companyId,
        period_start: periodStart,
        period_end: periodEnd,
        fiscal_year: Number(fy) || new Date().getFullYear(),
        period_label: label.trim() || undefined,
      }),
    onSuccess: () => pushToast("Period created", "success"),
    onError: (e) => pushToast(String((e as Error).message ?? "Failed"), "error"),
  });

  const closeMut = useMutation({
    mutationFn: () => closeAccountingPeriod(closeId, { operating_company_id: companyId }),
    onSuccess: () => pushToast("Period closed", "success"),
    onError: (e) => pushToast(String((e as Error).message ?? "Failed"), "error"),
  });

  const reopenMut = useMutation({
    mutationFn: () => reopenAccountingPeriod(reopenId, { operating_company_id: companyId, reason: reopenReason.trim() }),
    onSuccess: () => pushToast("Period reopened", "success"),
    onError: (e) => pushToast(String((e as Error).message ?? "Failed"), "error"),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Period close" subtitle="Create fiscal periods and close books (list UI pending GET /accounting/periods)." />
      {!companyId ? <p className="text-sm text-amber-800">Select an operating company.</p> : null}

      <section className="rounded border border-gray-200 bg-white p-4 text-sm">
        <h2 className="mb-2 font-semibold">+ Create period</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            Start
            <input type="date" className="mt-1 w-full rounded border px-2 py-1" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </label>
          <label className="block">
            End
            <input type="date" className="mt-1 w-full rounded border px-2 py-1" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </label>
          <label className="block">
            Fiscal year
            <input className="mt-1 w-full rounded border px-2 py-1" value={fy} onChange={(e) => setFy(e.target.value)} />
          </label>
          <label className="block">
            Label
            <input className="mt-1 w-full rounded border px-2 py-1" value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
        </div>
        <ActionButton
          type="button"
          className="mt-3 bg-blue-600 text-white"
          aria-label="Create accounting period"
          disabled={!companyId || !periodStart || !periodEnd || createMut.isPending}
          onClick={() => void createMut.mutateAsync()}
        >
          Save period
        </ActionButton>
      </section>

      <section className="rounded border border-gray-200 bg-white p-4 text-sm">
        <h2 className="mb-2 font-semibold">Close period</h2>
        <label className="block">
          Period id (UUID)
          <input className="mt-1 w-full rounded border px-2 py-1 font-mono text-xs" value={closeId} onChange={(e) => setCloseId(e.target.value)} />
        </label>
        <ActionButton
          type="button"
          className="mt-3 border border-red-200 bg-red-50 text-red-900"
          aria-label="Close accounting period"
          disabled={!closeId || !companyId || closeMut.isPending}
          onClick={() => {
            if (!window.confirm("Close this period? Transactions on or before period end may lock.")) return;
            void closeMut.mutateAsync();
          }}
        >
          Close period
        </ActionButton>
      </section>

      <section className="rounded border border-gray-200 bg-white p-4 text-sm">
        <h2 className="mb-2 font-semibold">Reopen period (Owner)</h2>
        <label className="block">
          Period id
          <input className="mt-1 w-full rounded border px-2 py-1 font-mono text-xs" value={reopenId} onChange={(e) => setReopenId(e.target.value)} />
        </label>
        <label className="mt-2 block">
          Reason
          <input className="mt-1 w-full rounded border px-2 py-1" value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} />
        </label>
        <ActionButton
          type="button"
          className="mt-3 border border-amber-200 bg-amber-50 text-amber-900"
          aria-label="Reopen accounting period"
          disabled={!reopenId || !reopenReason.trim() || !companyId || reopenMut.isPending}
          onClick={() => void reopenMut.mutateAsync()}
        >
          Reopen
        </ActionButton>
      </section>
    </div>
  );
}
