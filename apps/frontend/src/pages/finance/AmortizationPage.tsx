import { useEffect, useState } from "react";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useFeatureFlag } from "../../hooks/useFeatureFlag";
import { FinanceModuleTabs } from "./FinanceModuleTabs";
import {
  FINANCE_HUB_AMORTIZATION_FLAG,
  createLoan,
  getLoanSchedule,
  listLoans,
  type AmortLoan,
  type AmortRow,
} from "../../api/financeAmortization";

const dollars = (cents: number) => (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
const toCents = (s: string) => Math.round((Number(s) || 0) * 100);

// Display-only column set — same order, labels, right-alignment, and dollars() cents
// formatting as the former hand-rolled table markup. No amount math changes.
const SCHEDULE_COLUMNS: Array<ParityColumn<AmortRow>> = [
  { key: "payment_number", label: "#", sortable: true },
  { key: "due_date", label: "Due", sortable: true },
  { key: "payment_cents", label: "Payment", sortable: true, className: "text-right", render: (r) => dollars(r.payment_cents) },
  { key: "principal_cents", label: "Principal", sortable: true, className: "text-right", render: (r) => dollars(r.principal_cents) },
  { key: "interest_cents", label: "Interest", sortable: true, className: "text-right", render: (r) => dollars(r.interest_cents) },
  { key: "remaining_balance_cents", label: "Balance", sortable: true, className: "text-right", render: (r) => dollars(r.remaining_balance_cents) },
];

export function AmortizationPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { enabled, loading: flagLoading } = useFeatureFlag(FINANCE_HUB_AMORTIZATION_FLAG, companyId);

  const [loans, setLoans] = useState<AmortLoan[]>([]);
  const [schedule, setSchedule] = useState<AmortRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", lender: "", principal: "", ratePct: "", termMonths: "60", firstPaymentDate: "" });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    if (!enabled || !companyId) return;
    listLoans(companyId).then((r) => setLoans(r.loans)).catch(() => setLoans([]));
  }, [enabled, companyId]);

  async function onCreate() {
    setBusy(true); setError(null);
    try {
      const res = await createLoan({
        operating_company_id: companyId,
        name: form.name,
        lender: form.lender || null,
        original_principal_cents: toCents(form.principal),
        interest_rate_bps: Math.round((Number(form.ratePct) || 0) * 100),
        term_months: Number(form.termMonths) || 0,
        first_payment_date: form.firstPaymentDate,
      });
      setLoans((l) => [res.loan, ...l]);
      setSelected(res.loan.id); setSchedule(res.rows.map((r) => ({ ...r, posted: false })));
    } catch (e) {
      const m = e as { payload?: { message?: string }; message?: string };
      setError(m?.payload?.message ?? m?.message ?? "Create failed");
    } finally { setBusy(false); }
  }

  async function openSchedule(id: string) {
    setSelected(id);
    try { setSchedule((await getLoanSchedule(id, companyId)).schedule); } catch { setSchedule([]); }
  }

  const header = (
    <div className="mb-4">
      <h1 className="text-lg font-semibold text-slate-800">Amortization</h1>
      <p className="text-sm text-slate-500">Create a loan and generate its amortization schedule. Schedules are stored; posting is a separate step.</p>
    </div>
  );
  if (flagLoading) return <div className="p-6"><FinanceModuleTabs />{header}<p className="text-sm text-slate-500">Loading…</p></div>;
  if (!enabled)
    return (
      <div className="p-6"><FinanceModuleTabs />{header}
        <div className="rounded-sm border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Amortization is not yet enabled for this company. (Feature flag <code>{FINANCE_HUB_AMORTIZATION_FLAG}</code> is off.)
        </div>
      </div>
    );

  const field = (label: string, key: keyof typeof form, type = "text") => (
    <label className="block"><span className="text-xs font-medium text-slate-600">{label}</span>
      <input type={type} value={form[key]} onChange={set(key)} className="mt-1 w-full rounded-sm border border-slate-300 px-2 py-1.5 text-sm" />
    </label>
  );

  return (
    <div className="p-6"><FinanceModuleTabs />{header}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-sm border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">New loan</h2>
          <div className="grid grid-cols-2 gap-3">
            {field("Name", "name")}{field("Lender", "lender")}
            {field("Principal ($)", "principal", "number")}{field("Rate (%)", "ratePct", "number")}
            {field("Term (months)", "termMonths", "number")}{field("First payment", "firstPaymentDate", "date")}
          </div>
          <button onClick={onCreate} disabled={busy || !companyId} className="mt-4 rounded-sm bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {busy ? "Generating…" : "Create + generate schedule"}
          </button>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>

        <div className="rounded-sm border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Loans</h2>
          {loans.length === 0 ? <p className="text-sm text-slate-500">No loans yet.</p> : (
            <ul className="space-y-1 text-sm">
              {loans.map((l) => (
                <li key={l.id}>
                  <button onClick={() => openSchedule(l.id)} className={`w-full text-left rounded-sm px-2 py-1 ${selected === l.id ? "bg-slate-100" : "hover:bg-slate-50"}`}>
                    <span className="font-medium text-slate-700">{l.name}</span>
                    <span className="block text-xs text-slate-500">{dollars(l.original_principal_cents)} @ {(l.interest_rate_bps / 100).toFixed(2)}% × {l.term_months}mo · {l.loan_type === "note_payable" ? "Note Payable" : "Loan Payable"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-sm border border-slate-200 bg-white p-4 lg:col-span-1">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Schedule</h2>
          {schedule.length === 0 ? <p className="text-sm text-slate-500">Select a loan to view its schedule.</p> : (
            <ParityTable<AmortRow>
              columns={SCHEDULE_COLUMNS}
              rows={schedule}
              rowKey={(r) => String(r.payment_number)}
              storageKey="finance-amortization-schedule"
              tableTestId="amortization-schedule-table"
              density="compact"
              initialPageSize={12}
              pageSizeOptions={[12, 60, 120, 360]}
              emptyText="Select a loan to view its schedule."
            />
          )}
        </div>
      </div>
    </div>
  );
}
