import { useState } from "react";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useFeatureFlag } from "../../hooks/useFeatureFlag";
import { FinanceModuleTabs } from "./FinanceModuleTabs";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import {
  FINANCE_HUB_LOAN_WIZARD_FLAG,
  previewLoanWizard,
  type LoanWizardPreview,
} from "../../api/financeLoanWizard";

const dollars = (cents: number) =>
  (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
const toCents = (s: string) => Math.round((Number(s) || 0) * 100);

/**
 * Display row for the opening-JE preview table. `debit`/`credit` are the SAME pre-formatted
 * strings the hand-rolled table rendered (dollars() when the side matches, "" otherwise) —
 * display-only migration, no amount math changed. The Totals row is appended as the last row
 * exactly as before (columns are non-sortable so line order and the trailing Totals row are
 * preserved 1:1).
 */
type OpeningJeRow = {
  id: string;
  description: string;
  debit: string;
  credit: string;
  isTotals: boolean;
};

const OPENING_JE_COLUMNS: Array<ParityColumn<OpeningJeRow>> = [
  {
    key: "description",
    label: "Description",
    render: (r) => (
      <span className={r.isTotals ? "font-medium text-slate-700" : "text-slate-600"}>{r.description}</span>
    ),
  },
  {
    key: "debit",
    label: "Debit",
    className: "text-right",
    cellClass: "text-right",
    render: (r) => <span className={r.isTotals ? "font-medium text-slate-700" : undefined}>{r.debit}</span>,
  },
  {
    key: "credit",
    label: "Credit",
    className: "text-right",
    cellClass: "text-right",
    render: (r) => <span className={r.isTotals ? "font-medium text-slate-700" : undefined}>{r.credit}</span>,
  },
];

export function LoanWizardPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { enabled, loading: flagLoading } = useFeatureFlag(FINANCE_HUB_LOAN_WIZARD_FLAG, companyId);

  const [form, setForm] = useState({
    assetName: "",
    vin: "",
    purchasePrice: "",
    downPayment: "0",
    loanAmount: "",
    annualRatePct: "",
    termMonths: "60",
    firstPaymentDate: "",
    lender: "",
    usefulLifeMonths: "60",
    salvageValue: "0",
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const [preview, setPreview] = useState<LoanWizardPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onPreview() {
    setBusy(true);
    setError(null);
    setPreview(null);
    try {
      const res = await previewLoanWizard({
        operating_company_id: companyId,
        purchase_price_cents: toCents(form.purchasePrice),
        down_payment_cents: toCents(form.downPayment),
        loan_amount_cents: toCents(form.loanAmount),
        annual_rate_pct: Number(form.annualRatePct) || 0,
        term_months: Number(form.termMonths) || 0,
        first_payment_date: form.firstPaymentDate,
        lender: form.lender,
        assets: [{ name: form.assetName, ...(form.vin ? { vin_serial: form.vin } : {}) }],
        useful_life_months: Number(form.usefulLifeMonths) || 60,
        salvage_value_cents: toCents(form.salvageValue),
      });
      setPreview(res.preview);
    } catch (e) {
      const msg = (e as { payload?: { message?: string }; message?: string });
      setError(msg?.payload?.message ?? msg?.message ?? "Preview failed");
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <div className="mb-4">
      <h1 className="text-lg font-semibold text-slate-800">Loan Wizard</h1>
      <p className="text-sm text-slate-500">
        One form → preview every entry the loan would create. Nothing posts — preview only.
      </p>
    </div>
  );

  if (flagLoading) {
    return (
      <div className="p-6">
        <FinanceModuleTabs />
        {header}
        <p className="text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="p-6">
        <FinanceModuleTabs />
        {header}
        <div className="rounded-sm border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          The Loan Wizard is not yet enabled for this company. (Feature flag{" "}
          <code>{FINANCE_HUB_LOAN_WIZARD_FLAG}</code> is off.)
        </div>
      </div>
    );
  }

  const field = (label: string, key: keyof typeof form, type = "text", placeholder = "") => (
    <label className="block">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <input
        type={type}
        value={form[key]}
        onChange={set(key)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-sm border border-slate-300 px-2 py-1.5 text-sm"
      />
    </label>
  );

  return (
    <div className="p-6">
      <FinanceModuleTabs />
      {header}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Inputs */}
        <div className="rounded-sm border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Loan & asset</h2>
          <div className="grid grid-cols-2 gap-3">
            {field("Asset name", "assetName", "text", "Peterbilt 579")}
            {field("VIN / serial", "vin")}
            {field("Purchase price ($)", "purchasePrice", "number")}
            {field("Down payment ($)", "downPayment", "number")}
            {field("Loan amount ($)", "loanAmount", "number")}
            {field("Annual rate (%)", "annualRatePct", "number")}
            {field("Term (months)", "termMonths", "number")}
            {field("First payment date", "firstPaymentDate", "date")}
            {field("Lender", "lender", "text", "Commercial Credit Group")}
            {field("Useful life (months)", "usefulLifeMonths", "number")}
            {field("Salvage value ($)", "salvageValue", "number")}
          </div>
          <button
            onClick={onPreview}
            disabled={busy || !companyId}
            className="mt-4 rounded-sm bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Computing…" : "Preview"}
          </button>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>

        {/* Preview pane */}
        <div className="rounded-sm border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Will auto-create (preview)</h2>
          {!preview ? (
            <p className="text-sm text-slate-500">Enter loan details and Preview to see every generated entry.</p>
          ) : (
            <div className="space-y-4 text-sm">
              <div className="flex items-center gap-2">
                <span className={preview.balanced ? "rounded-sm bg-slate-100 px-2 py-0.5 text-slate-700" : "rounded-sm bg-red-100 px-2 py-0.5 text-red-700"}>
                  {preview.balanced ? "Opening JE balanced ✓" : "Opening JE does NOT balance"}
                </span>
              </div>
              <div>
                <div className="font-medium text-slate-700">
                  {preview.loan_record.loan_type === "note_payable" ? "Note Payable (long-term)" : "Loan Payable (current)"} — {preview.loan_record.lender}
                </div>
                <div className="text-slate-500">
                  {dollars(preview.loan_record.principal_cents)} @ {preview.loan_record.annual_rate_pct}% × {preview.loan_record.term_months} mo · monthly {dollars(preview.summary.monthly_payment_cents)} · total interest {dollars(preview.summary.total_interest_cents)}
                </div>
              </div>
              <div>
                <div className="font-medium text-slate-700">Fixed asset + depreciation</div>
                <div className="text-slate-500">
                  Capitalized {dollars(preview.fixed_asset.capitalized_cost_cents)} · straight-line {preview.fixed_asset.useful_life_months} mo · salvage {dollars(preview.fixed_asset.salvage_value_cents)} ({preview.depreciation_schedule.length} periods)
                </div>
              </div>
              <div>
                <div className="font-medium text-slate-700">Opening journal entry</div>
                <div className="mt-1">
                  <ParityTable
                    columns={OPENING_JE_COLUMNS}
                    rows={[
                      ...preview.opening_journal_entry.lines.map(
                        (l, i): OpeningJeRow => ({
                          id: `line-${i}`,
                          description: l.description,
                          debit: l.debit_or_credit === "debit" ? dollars(l.amount_cents) : "",
                          credit: l.debit_or_credit === "credit" ? dollars(l.amount_cents) : "",
                          isTotals: false,
                        }),
                      ),
                      {
                        id: "totals",
                        description: "Totals",
                        debit: dollars(preview.opening_journal_entry.debit_total_cents),
                        credit: dollars(preview.opening_journal_entry.credit_total_cents),
                        isTotals: true,
                      },
                    ]}
                    rowKey={(r) => r.id}
                    storageKey="loan-wizard-opening-je"
                    tableTestId="loan-wizard-opening-je-table"
                    emptyText="No journal lines in preview."
                  />
                </div>
              </div>
              <p className="text-xs text-slate-400">
                Preview only — posting these entries is a separate, owner-gated step (not enabled here).
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
