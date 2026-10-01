import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { legalMattersApi } from "../../api/legal-matters";
import { listCoaAccountsForJe } from "../../api/accounting";
import { companyToday } from "../../lib/businessDate";
import { formatUsdCentsTable } from "../../lib/money";
import { userFacingApiError } from "../../lib/api-error-message";
import { Button } from "../Button";
import { DatePicker } from "../forms/DatePicker";
import { MoneyInput } from "../forms/MoneyInput";
import { ReferenceSelect, type ReferenceOption } from "../parity/ReferenceSelect";
import { EntityLink } from "../shared/EntityLink";

/**
 * ROUND 316 — a matter's reserve posts to the books. Pick the legal-expense and accrued-legal-liability accounts;
 * the entry books only the change since the last posted reserve (increase or release), sourced to this matter.
 */
export function MatterReservePanel({ operatingCompanyId, matterId, reserveCents, postedCents, reserveJournalEntryId }: {
  operatingCompanyId: string; matterId: string; reserveCents: number | null; postedCents: number | null; reserveJournalEntryId: string | null;
}) {
  const qc = useQueryClient();
  const [expense, setExpense] = useState<string | null>(null);
  const [liability, setLiability] = useState<string | null>(null);
  const [date, setDate] = useState(companyToday());
  const [amount, setAmount] = useState<number | null>(reserveCents);
  const [msg, setMsg] = useState<string | null>(null);
  const accounts = useQuery({ queryKey: ["coa", "matter-reserve", operatingCompanyId], queryFn: () => listCoaAccountsForJe(operatingCompanyId, { postableOnly: true }) });
  const options: ReferenceOption[] = useMemo(
    () => (accounts.data?.accounts ?? []).map((a) => ({ value: a.id, label: a.account_number ? `${a.account_number} ${a.account_name}` : a.account_name, type: a.account_type ?? undefined })),
    [accounts.data]
  );
  const post = useMutation({
    mutationFn: () => legalMattersApi.postReserve(operatingCompanyId, matterId, { expense_account_id: String(expense), liability_account_id: String(liability), entry_date: date, reserve_cents: amount ?? undefined }),
    onSuccess: (r) => {
      setMsg(r.posted ? `Posted ${formatUsdCentsTable(Math.abs(r.delta_cents ?? 0))} (${(r.delta_cents ?? 0) > 0 ? "increase" : "release"}).` : r.reason ?? "Nothing to post.");
      void qc.invalidateQueries({ queryKey: ["legal", "matter"] });
    },
    onError: (e) => setMsg(userFacingApiError(e, "Could not post the reserve.")),
  });
  return (
    <section className="space-y-2 rounded-sm border border-gray-200 bg-white p-3 text-xs" data-testid="matter-reserve-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-slate-900">Reserve</span>
        <span className="text-gray-600">
          Posted {formatUsdCentsTable(postedCents ?? 0)}
          {reserveJournalEntryId ? <> · <EntityLink kind="journal_entry" id={reserveJournalEntryId} label="Journal entry" className="underline" /></> : null}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
        <label className="flex flex-col gap-1 font-semibold text-gray-600">Reserve amount<MoneyInput valueCents={amount} onChangeCents={setAmount} /></label>
        <div className="flex flex-col gap-1 font-semibold text-gray-600">Legal expense account<ReferenceSelect value={expense} onChange={setExpense} options={options} createKind="account" operatingCompanyId={operatingCompanyId} placeholder="Select…" loading={accounts.isLoading} /></div>
        <div className="flex flex-col gap-1 font-semibold text-gray-600">Accrued legal liability<ReferenceSelect value={liability} onChange={setLiability} options={options} createKind="account" operatingCompanyId={operatingCompanyId} placeholder="Select…" loading={accounts.isLoading} /></div>
        <label className="flex flex-col gap-1 font-semibold text-gray-600">Entry date<DatePicker value={date} onChange={setDate} /></label>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={!expense || !liability || amount == null || post.isPending} onClick={() => { setMsg(null); post.mutate(); }}>Post reserve</Button>
        {msg ? <span className="text-gray-700">{msg}</span> : null}
      </div>
    </section>
  );
}
