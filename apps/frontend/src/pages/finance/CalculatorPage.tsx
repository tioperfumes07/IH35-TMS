import { useState } from "react";
import { formatDateUS } from "../../lib/formatDate";
import { Link } from "react-router-dom";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useFeatureFlag } from "../../hooks/useFeatureFlag";
import { FinanceModuleTabs } from "./FinanceModuleTabs";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { PageHeader } from "../../components/layout/PageHeader";
import { DatePicker } from "../../components/forms/DatePicker";
import {
  FINANCE_HUB_CALCULATOR_FLAG,
  computeCalculator,
  type CalcPreviewRow,
  type CalcScenario,
} from "../../api/financeCalculator";

const dollars = (c: number) => (c / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
const toCents = (s: string) => Math.round((Number(s) || 0) * 100);

// Display-only ParityTable migration: same columns, order, and dollars() formatting as the
// former hand-rolled amortization preview table. No posting/mutation — pure calculation output.
const AMORT_COLUMNS: Array<ParityColumn<CalcPreviewRow>> = [
  { key: "period", label: "#", sortable: true },
  { key: "date", label: "Due", sortable: true },
  { key: "principal_cents", label: "Principal", className: "text-right", sortable: true, render: (r) => dollars(r.principal_cents) },
  { key: "interest_cents", label: "Interest", className: "text-right", sortable: true, render: (r) => dollars(r.interest_cents) },
  { key: "balance_cents", label: "Balance", className: "text-right", sortable: true, render: (r) => dollars(r.balance_cents) },
];

export function CalculatorPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { enabled, loading: flagLoading } = useFeatureFlag(FINANCE_HUB_CALCULATOR_FLAG, companyId);

  const [form, setForm] = useState({ price: "", down: "0", firstPaymentDate: "", rateA: "", termA: "60", rateB: "", termB: "36" });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const [scenarios, setScenarios] = useState<CalcScenario[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // CLS-FINANCE-PREVIEW-RAW-VALIDATION-ERROR — gate Calculate on required fields; never flash raw tokens.
  const calcReady =
    !!companyId &&
    toCents(form.price) > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(form.firstPaymentDate) &&
    Number(form.rateA) >= 0 &&
    String(form.rateA).trim() !== "" &&
    Number(form.termA) > 0;

  function mapCalcError(e: unknown): string {
    const ae = e as { message?: string; data?: { error?: string; message?: string } };
    const code = (ae?.data && typeof ae.data.error === "string" ? ae.data.error : ae?.message) ?? "";
    if (code === "validation_error") {
      return "Enter price, first payment date, Scenario A rate, and term before calculating.";
    }
    if (code === "feature_disabled") {
      return "The Finance Calculator is not enabled for this company.";
    }
    if (ae?.data && typeof ae.data.message === "string" && ae.data.message.trim()) return ae.data.message;
    if (ae?.message && ae.message !== "validation_error") return ae.message;
    return "Calculation failed. Check inputs and try again.";
  }

  async function onCompute() {
    if (!calcReady) {
      setError("Enter price, first payment date, Scenario A rate, and term before calculating.");
      return;
    }
    setBusy(true); setError(null); setScenarios([]);
    try {
      const sc: Array<{ annual_rate_pct: number; term_months: number }> = [{ annual_rate_pct: Number(form.rateA) || 0, term_months: Number(form.termA) || 0 }];
      if (form.rateB && form.termB) sc.push({ annual_rate_pct: Number(form.rateB) || 0, term_months: Number(form.termB) || 0 });
      const res = await computeCalculator({
        operating_company_id: companyId,
        price_cents: toCents(form.price),
        down_payment_cents: toCents(form.down),
        first_payment_date: form.firstPaymentDate,
        scenarios: sc,
      });
      setScenarios(res.scenarios);
    } catch (e) {
      setError(mapCalcError(e));
    } finally { setBusy(false); }
  }

  // UI-BACK-BUTTON-MISSING-ENTIRELY: see LoanWizardPage.tsx sibling comment.
  const header = <PageHeader backHref="/finance/overview" title="Finance Calculator" subtitle="Model a financed purchase before committing. Pure calculation — nothing is saved or posted." />;
  if (flagLoading) return <div className="p-6"><FinanceModuleTabs />{header}<p className="text-sm text-slate-500">Loading…</p></div>;
  if (!enabled)
    return (
      <div className="p-6"><FinanceModuleTabs />{header}
        <div className="rounded-sm border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          The Finance Calculator is not yet enabled for this company. (Feature flag <code>{FINANCE_HUB_CALCULATOR_FLAG}</code> is off.)
        </div>
      </div>
    );

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

  return (
    <div className="p-6"><FinanceModuleTabs />{header}
      <div className="rounded-sm border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {moneyField("Price ($) *", "price")}{moneyField("Down payment ($)", "down")}
          <label className="block">
            <span className="text-xs font-medium text-slate-600">First payment *</span>
            <DatePicker
              className="mt-1 w-full"
              value={form.firstPaymentDate}
              onChange={(next) => setForm((f) => ({ ...f, firstPaymentDate: next }))}
            />
          </label>
          {field("Scenario A rate (%) *", "rateA", "number")}{field("Scenario A term (mo) *", "termA", "number")}
          {field("Scenario B rate (%) — optional", "rateB", "number")}{field("Scenario B term (mo)", "termB", "number")}
        </div>
        <button onClick={onCompute} disabled={busy || !calcReady} title={!calcReady ? "Enter price, first payment date, Scenario A rate, and term before calculating." : undefined} className="mt-4 rounded-sm bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {busy ? "Calculating…" : "Calculate"}
        </button>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      {scenarios.length > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {scenarios.map((s, i) => (
            <div key={i} className="rounded-sm border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-slate-700">{i === 0 ? "Scenario A" : "Scenario B"} — {s.annual_rate_pct}% × {s.term_months}mo</h2>
              <dl className="mt-2 grid grid-cols-2 gap-1 text-sm text-slate-600">
                <dt>Financed</dt><dd className="text-right">{dollars(s.financed_principal_cents)}</dd>
                <dt>Monthly payment</dt><dd className="text-right font-medium text-slate-800">{dollars(s.monthly_payment_cents)}</dd>
                <dt>Total interest</dt><dd className="text-right">{dollars(s.total_interest_cents)}</dd>
                <dt>Total paid</dt><dd className="text-right">{dollars(s.total_payments_cents)}</dd>
                <dt>Payoff date</dt><dd className="text-right">{formatDateUS(s.payoff_date)}</dd>
              </dl>
              <div className="mt-3">
                <ParityTable<CalcPreviewRow>
                  columns={AMORT_COLUMNS}
                  rows={s.amortization_preview}
                  rowKey={(r) => String(r.period)}
                  storageKey="finance-calculator-amortization"
                  tableTestId="finance-calculator-amortization-table"
                  emptyText="No amortization rows."
                />
              </div>
              {/* GO-0043-CALCULATOR-LOAN-WIZARD-DATA-LOSS: previously ONE shared link below both
                  cards read "Use these -> create loan" -- ambiguous about which scenario "these"
                  even meant, AND LoanWizardPage never read anything from it (no location.state/
                  searchParams consumer existed), so every click landed on a fully blank form,
                  silently discarding every number just computed. Now per-scenario (removes the
                  ambiguity) and carries the actual computed terms via router state (financial
                  data -- never put in the URL query string). */}
              <div className="mt-3">
                <Link
                  to="/finance/loan-wizard"
                  state={{
                    purchasePrice: form.price,
                    downPayment: form.down,
                    firstPaymentDate: form.firstPaymentDate,
                    annualRatePct: String(s.annual_rate_pct),
                    termMonths: String(s.term_months),
                  }}
                  className="text-sm font-medium text-slate-700 underline"
                >
                  Use this scenario → create loan
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
