import { useState } from "react";
import { Link } from "react-router-dom";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useFeatureFlag } from "../../hooks/useFeatureFlag";
import { FinanceModuleTabs } from "./FinanceModuleTabs";
import { FINANCE_HUB_CALCULATOR_FLAG, computeCalculator, type CalcScenario } from "../../api/financeCalculator";

const dollars = (c: number) => (c / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
const toCents = (s: string) => Math.round((Number(s) || 0) * 100);

export function CalculatorPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { enabled, loading: flagLoading } = useFeatureFlag(FINANCE_HUB_CALCULATOR_FLAG, companyId);

  const [form, setForm] = useState({ price: "", down: "0", firstPaymentDate: "", rateA: "", termA: "60", rateB: "", termB: "36" });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const [scenarios, setScenarios] = useState<CalcScenario[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onCompute() {
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
      const m = e as { payload?: { message?: string }; message?: string };
      setError(m?.payload?.message ?? m?.message ?? "Calculation failed");
    } finally { setBusy(false); }
  }

  const header = (
    <div className="mb-4">
      <h1 className="text-lg font-semibold text-slate-800">Finance Calculator</h1>
      <p className="text-sm text-slate-500">Model a financed purchase before committing. Pure calculation — nothing is saved or posted.</p>
    </div>
  );
  if (flagLoading) return <div className="p-6"><FinanceModuleTabs />{header}<p className="text-sm text-slate-500">Loading…</p></div>;
  if (!enabled)
    return (
      <div className="p-6"><FinanceModuleTabs />{header}
        <div className="rounded border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          The Finance Calculator is not yet enabled for this company. (Feature flag <code>{FINANCE_HUB_CALCULATOR_FLAG}</code> is off.)
        </div>
      </div>
    );

  const field = (label: string, key: keyof typeof form, type = "text") => (
    <label className="block"><span className="text-xs font-medium text-slate-600">{label}</span>
      <input type={type} value={form[key]} onChange={set(key)} className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
    </label>
  );

  return (
    <div className="p-6"><FinanceModuleTabs />{header}
      <div className="rounded border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {field("Price ($)", "price", "number")}{field("Down payment ($)", "down", "number")}{field("First payment", "firstPaymentDate", "date")}
          {field("Scenario A rate (%)", "rateA", "number")}{field("Scenario A term (mo)", "termA", "number")}
          {field("Scenario B rate (%) — optional", "rateB", "number")}{field("Scenario B term (mo)", "termB", "number")}
        </div>
        <button onClick={onCompute} disabled={busy || !companyId} className="mt-4 rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {busy ? "Calculating…" : "Calculate"}
        </button>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      {scenarios.length > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {scenarios.map((s, i) => (
            <div key={i} className="rounded border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-slate-700">{i === 0 ? "Scenario A" : "Scenario B"} — {s.annual_rate_pct}% × {s.term_months}mo</h2>
              <dl className="mt-2 grid grid-cols-2 gap-1 text-sm text-slate-600">
                <dt>Financed</dt><dd className="text-right">{dollars(s.financed_principal_cents)}</dd>
                <dt>Monthly payment</dt><dd className="text-right font-medium text-slate-800">{dollars(s.monthly_payment_cents)}</dd>
                <dt>Total interest</dt><dd className="text-right">{dollars(s.total_interest_cents)}</dd>
                <dt>Total paid</dt><dd className="text-right">{dollars(s.total_payments_cents)}</dd>
                <dt>Payoff date</dt><dd className="text-right">{s.payoff_date}</dd>
              </dl>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-slate-500"><th className="py-1">#</th><th>Due</th><th className="text-right">Principal</th><th className="text-right">Interest</th><th className="text-right">Balance</th></tr></thead>
                  <tbody>
                    {s.amortization_preview.map((r) => (
                      <tr key={r.period} className="border-b border-slate-100">
                        <td className="py-1">{r.period}</td><td>{r.date}</td>
                        <td className="text-right">{dollars(r.principal_cents)}</td><td className="text-right">{dollars(r.interest_cents)}</td><td className="text-right">{dollars(r.balance_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {scenarios.length > 0 && (
        <p className="mt-4 text-sm text-slate-500">
          <Link to="/finance/loan-wizard" className="text-slate-700 underline">Use these → create loan</Link> (opens the Loan Wizard).
        </p>
      )}
    </div>
  );
}
