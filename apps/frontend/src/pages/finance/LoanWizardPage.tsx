import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useFeatureFlag } from "../../hooks/useFeatureFlag";
import { FinanceModuleTabs } from "./FinanceModuleTabs";
import { PageHeader } from "../../components/layout/PageHeader";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { DatePicker } from "../../components/forms/DatePicker";
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

// GO-0043-CALCULATOR-LOAN-WIZARD-DATA-LOSS: shape of the router state CalculatorPage's "Use this
// scenario -> create loan" link passes -- optional, since this page is also reached by direct
// navigation (Loan Wizard nav link, bookmark, back button) with no incoming state at all.
type LoanWizardIncomingState = {
  purchasePrice?: string;
  downPayment?: string;
  firstPaymentDate?: string;
  annualRatePct?: string;
  termMonths?: string;
};

export function LoanWizardPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { enabled, loading: flagLoading } = useFeatureFlag(FINANCE_HUB_LOAN_WIZARD_FLAG, companyId);
  const location = useLocation();
  const incoming = (location.state ?? {}) as LoanWizardIncomingState;

  const [form, setForm] = useState({
    assetName: "",
    vin: "",
    purchasePrice: incoming.purchasePrice ?? "",
    downPayment: incoming.downPayment ?? "0",
    loanAmount: "",
    annualRatePct: incoming.annualRatePct ?? "",
    termMonths: incoming.termMonths ?? "60",
    firstPaymentDate: incoming.firstPaymentDate ?? "",
    lender: "",
    usefulLifeMonths: "60",
    salvageValue: "0",
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const [preview, setPreview] = useState<LoanWizardPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // CLS-FINANCE-PREVIEW-RAW-VALIDATION-ERROR — gate Preview on required fields; never flash raw tokens.
  const previewReady =
    !!companyId &&
    form.assetName.trim().length > 0 &&
    toCents(form.purchasePrice) > 0 &&
    String(form.annualRatePct).trim() !== "" &&
    Number(form.annualRatePct) >= 0 &&
    Number(form.termMonths) > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(form.firstPaymentDate) &&
    form.lender.trim().length > 0;

  function mapPreviewError(e: unknown): string {
    const ae = e as { message?: string; data?: { error?: string; message?: string } };
    const code = (ae?.data && typeof ae.data.error === "string" ? ae.data.error : ae?.message) ?? "";
    if (code === "validation_error") {
      return "Enter asset name, purchase price, rate, term, first payment date, and lender before preview.";
    }
    if (code === "feature_disabled") {
      return "The Loan Wizard is not enabled for this company.";
    }
    if (code === "unbalanced_preview" && ae?.data && typeof ae.data.message === "string") {
      return ae.data.message;
    }
    if (ae?.data && typeof ae.data.message === "string" && ae.data.message.trim()) return ae.data.message;
    if (ae?.message && ae.message !== "validation_error") return ae.message;
    return "Preview failed. Check inputs and try again.";
  }

  async function onPreview() {
    if (!previewReady) {
      setError("Enter asset name, purchase price, rate, term, first payment date, and lender before preview.");
      return;
    }
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
      setError(mapPreviewError(e));
    } finally {
      setBusy(false);
    }
  }

  // UI-BACK-BUTTON-MISSING-ENTIRELY: FinanceModuleTabs (the shared subnav rendered above this on
  // every Finance page) has no back control of its own -- 6 of the 10 Finance pages already carry
  // their own PageHeader (backHref="/finance/overview", the module hub) alongside it; this page
  // didn't. Matched to the same established convention instead of inventing a new one.
  const header = <PageHeader backHref="/finance/overview" title="Loan Wizard" subtitle="One form → preview every entry the loan would create. Nothing posts — preview only." />;

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

  const field = (label: string, key: keyof typeof form, type: "text" | "number" = "text", placeholder = "") => (
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

  // ACCT-F5314: dollar fields go through the shared MoneyInput seam (not the generic `field()`
  // helper above, whose value={form[key]} binding is invisible to verify-money-fields-use-moneyinput
  // — the field name only ever appears as a runtime key, never as source text). DOLLARS mode: the
  // form keeps storing a plain string, unchanged submit contract (toCents(form.key) on Preview).
  const moneyField = (label: string, key: keyof typeof form) => (
    <label className="block">
      <span className="text-xs font-medium text-slate-600">{label}</span>
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
    <div className="p-6">
      <FinanceModuleTabs />
      {header}
      {/* Flat QBO-style workspace — single section frame, divide-x columns (no nested bordered tiles). */}
      <section className="overflow-hidden rounded-sm border border-slate-200 bg-white">
        <div className="grid grid-cols-1 lg:grid-cols-2 lg:divide-x lg:divide-slate-100">
          {/* Inputs */}
          <div>
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
              Loan &amp; asset
            </div>
            <div className="px-4 py-3">
              <div className="grid grid-cols-2 gap-3">
                {field("Asset name *", "assetName", "text", "Peterbilt 579")}
                {field("VIN / serial", "vin")}
                {moneyField("Purchase price ($) *", "purchasePrice")}
                {moneyField("Down payment ($)", "downPayment")}
                {moneyField("Loan amount ($)", "loanAmount")}
                {field("Annual rate (%) *", "annualRatePct", "number")}
                {field("Term (months) *", "termMonths", "number")}
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">First payment date *</span>
                  <DatePicker
                    className="mt-1 w-full"
                    value={form.firstPaymentDate}
                    onChange={(next) => setForm((f) => ({ ...f, firstPaymentDate: next }))}
                  />
                </label>
                {field("Lender *", "lender", "text", "Commercial Credit Group")}
                {field("Useful life (months)", "usefulLifeMonths", "number")}
                {moneyField("Salvage value ($)", "salvageValue")}
              </div>
              <button
                onClick={onPreview}
                disabled={busy || !previewReady}
                title={!previewReady ? "Enter asset name, purchase price, rate, term, first payment date, and lender before preview." : undefined}
                className="mt-4 rounded-sm bg-[#1f2a44] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy ? "Computing…" : "Preview"}
              </button>
              {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            </div>
          </div>

          {/* Preview pane */}
          <div>
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
              Will auto-create (preview)
            </div>
            <div className="px-4 py-3">
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
                    Preview only — posting these entries is a separate, disabled step (not enabled here).
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
