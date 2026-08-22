import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { DatePicker } from "../../components/forms/DatePicker";
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
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// LV-FINANCE-AMORTIZATION-CREATE-UNGATED-RAW-DATE — the create button had no client readiness
// predicate at all: name/principal/rate/date could all be blank and the click still fired,
// converting blanks to zero (toCents("") === 0) before POST. The backend's own zod schema
// (createLoanInputSchema) already refuses these server-side (positive() on principal/term_months,
// a date regex) — so this was never a money-integrity gap, only a guaranteed-to-400 UX papercut on
// a real accounting creator. Mirrors backend's own bounds so the button disables BEFORE the round
// trip, not after a confusing server error.
function amortizationFormReady(form: {
  name: string;
  principal: string;
  ratePct: string;
  termMonths: string;
  firstPaymentDate: string;
}): boolean {
  if (!form.name.trim()) return false;
  const principalCents = toCents(form.principal);
  if (!Number.isFinite(principalCents) || principalCents <= 0) return false;
  const rate = Number(form.ratePct);
  if (form.ratePct !== "" && (!Number.isFinite(rate) || rate < 0)) return false;
  const term = Number(form.termMonths);
  if (!Number.isInteger(term) || term <= 0 || term > 600) return false;
  if (!ISO_DATE_RE.test(form.firstPaymentDate)) return false;
  return true;
}

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
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedLoanId = searchParams.get("loan_id");

  const [loans, setLoans] = useState<AmortLoan[]>([]);
  const [schedule, setSchedule] = useState<AmortRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // LST-F103: never swallow list/schedule failures into empty UI (looks like "no loans").
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", lender: "", principal: "", ratePct: "", termMonths: "60", firstPaymentDate: "" });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const formReady = useMemo(() => amortizationFormReady(form), [form]);

  useEffect(() => {
    if (!enabled || !companyId) return;
    setLoadError(null);
    listLoans(companyId)
      .then((r) => setLoans(r.loans))
      .catch((err: unknown) => {
        setLoans([]);
        setLoadError(err instanceof Error ? err.message : "Failed to load loans");
      });
  }, [enabled, companyId]);

  useEffect(() => {
    if (!enabled || !companyId || !requestedLoanId) return;
    setSelected(requestedLoanId);
    setLoadError(null);
    getLoanSchedule(requestedLoanId, companyId)
      .then((r) => setSchedule(r.schedule))
      .catch((err: unknown) => {
        setSchedule([]);
        setLoadError(err instanceof Error ? err.message : "Failed to load amortization schedule");
      });
  }, [enabled, companyId, requestedLoanId]);

  async function onCreate() {
    // Recheck on submit — never trust only the disabled attribute (defense in depth: a stale
    // render, a fast double-click before re-render, or a future caller of this handler).
    if (!amortizationFormReady(form)) {
      setError("Enter a name, a positive principal, a term, and a first payment date before creating a loan.");
      return;
    }
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

  function openSchedule(id: string) {
    setSelected(id);
    const next = new URLSearchParams(searchParams);
    next.set("loan_id", id);
    setSearchParams(next, { replace: true });
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
        <section className="overflow-hidden rounded-sm border border-slate-200 bg-white">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">Amortization unavailable</div>
          <p className="px-4 py-3 text-sm text-slate-600">
            Amortization is not yet enabled for this company. (Feature flag <code>{FINANCE_HUB_AMORTIZATION_FLAG}</code> is off.)
          </p>
        </section>
      </div>
    );

  // LV-FINANCE-AMORTIZATION-CREATE-UNGATED-RAW-DATE — `type` is narrowed to "text" | "number" so
  // this helper can no longer be called with "date" at all (it used to accept any string, and the
  // one "date" call site rendered a raw native <input type="date">, evading the raw-date guard's
  // literal-only match because the literal lived at the CALL SITE, not on the <input> tag itself).
  // The date field now has its own dedicated dateField() below, using the real shared DatePicker.
  const field = (label: string, key: keyof typeof form, type: "text" | "number" = "text") => (
    <label className="block"><span className="text-xs font-medium text-slate-600">{label}</span>
      <input type={type} value={form[key]} onChange={set(key)} className="mt-1 w-full rounded-sm border border-slate-300 px-2 py-1.5 text-sm" />
    </label>
  );
  // ACCT-F5314: see LoanWizardPage — same dollars-string-in-form / MoneyInput DOLLARS-mode seam.
  const moneyField = (label: string, key: keyof typeof form) => (
    <label className="block"><span className="text-xs font-medium text-slate-600">{label}</span>
      <div className="mt-1">
        <MoneyInput
          valueDollars={form[key] === "" ? null : Number(form[key])}
          onChangeDollars={(dollars) => setForm((f) => ({ ...f, [key]: dollars == null ? "" : String(dollars) }))}
          ariaLabel={label}
        />
      </div>
    </label>
  );
  const dateField = (label: string, key: keyof typeof form) => (
    <label className="block"><span className="text-xs font-medium text-slate-600">{label}</span>
      <div className="mt-1">
        <DatePicker
          value={form[key]}
          onChange={(v) => setForm((f) => ({ ...f, [key]: v }))}
          data-testid={`amortization-${key}`}
        />
      </div>
    </label>
  );

  return (
    <div className="p-6"><FinanceModuleTabs />{header}
      <section className="overflow-hidden rounded-sm border border-slate-200 bg-white">
        <div className="grid grid-cols-1 lg:grid-cols-3 lg:divide-x lg:divide-slate-100">
          <div className="min-w-0">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">New loan</div>
            <div className="px-4 py-3">
              <div className="grid grid-cols-2 gap-3">
                {field("Name", "name")}{field("Lender", "lender")}
                {moneyField("Principal ($)", "principal")}{field("Rate (%)", "ratePct", "number")}
                {field("Term (months)", "termMonths", "number")}{dateField("First payment", "firstPaymentDate")}
              </div>
              <button
                onClick={onCreate}
                disabled={busy || !companyId || !formReady}
                data-testid="amortization-create-button"
                className="mt-4 rounded-sm bg-[#1f2a44] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy ? "Generating…" : "Create + generate schedule"}
              </button>
              {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            </div>
          </div>

          <div className="min-w-0 border-t border-slate-100 lg:border-t-0">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">Loans</div>
            <div className="px-4 py-3">
              {loadError ? (
                <p className="text-sm text-red-600" data-testid="amortization-load-error">{loadError}</p>
              ) : null}
              {!loadError && loans.length === 0 ? <p className="text-sm text-slate-500">No loans yet.</p> : null}
              {!loadError && loans.length > 0 ? (
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
              ) : null}
            </div>
          </div>

          <div className="min-w-0 border-t border-slate-100 lg:border-t-0">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">Schedule</div>
            <div className="px-4 py-3">
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
      </section>
    </div>
  );
}
