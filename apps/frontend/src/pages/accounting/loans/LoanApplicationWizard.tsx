/**
 * Loans & Advances — 5-step application wizard.
 *
 * DoD-B (no rendered-but-unsent field): every control below writes into `form`, and `buildPayload`
 * serialises `form` into the exact shape of the backend `createBodySchema`
 * (apps/backend/src/accounting/related-party-loan-posting/routes.ts). The review step renders the
 * literal payload so a dropped field is visible before submit, not after.
 *
 * DoD-D (no silent default account): `account_id` has no fallback. The wizard refuses to submit
 * without an explicitly chosen postable account — it never guesses which account the money hits.
 *
 * No GL math here. POST /api/v1/accounting/related-party-loans posts through the existing poster.
 * V1 chrome: PARITY_MODAL_WIDTH (760px) centered modal, FORM_INPUT_CLASS inputs (h-9 / 13px /
 * rounded-sm / border-gray-300), locked palette, no emojis.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listCatalogAccounts } from "../../../api/catalog-accounts";
import {
  createRelatedPartyLoan,
  type CreateRelatedPartyLoanRequest,
  type LoanCounterpartyKind,
  type LoanDirection,
  type LoanInterestMethod,
  type LoanPaymentFrequency,
  type LoanRelationship,
  type LoanTargetType,
} from "../../../api/related-party-loans";
import { FORM_INPUT_CLASS, FORM_SELECT_CLASS, FORM_TEXTAREA_CLASS } from "../../../components/forms/inputClass";
import { colors, typography } from "../../../design/tokens";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import { DatePicker } from "../../../components/forms/DatePicker";
import { PARITY_MODAL_WIDTH } from "../../../components/parity/sizing";
import { companyToday } from "../../../lib/businessDate";
import { ReferenceSelect } from "../../../components/parity/ReferenceSelect";
import { DriverPickerWithCreate } from "../../../components/drivers/DriverPickerWithCreate";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onCreated: () => void;
};

type FormState = {
  direction: LoanDirection;
  relationship: LoanRelationship;
  counterparty_kind: LoanCounterpartyKind;
  counterparty_id: string;
  counterparty_name: string;
  account_id: string;
  target_type: LoanTargetType;
  target_id: string;
  principal_cents: number | null;
  entry_date: string;
  interest_rate_pct: string;
  interest_method: LoanInterestMethod;
  payment_frequency: LoanPaymentFrequency;
  payment_count: string;
  first_payment_date: string;
  funding_source_note: string;
};

const STEPS = ["Direction", "Counterparty", "Money & account", "Terms", "Review"] as const;

const RELATIONSHIPS: LoanRelationship[] = ["owner", "spouse", "friend", "employee", "related_company", "other"];
const COUNTERPARTY_KINDS: LoanCounterpartyKind[] = ["user", "driver", "vendor", "company", "other"];
const TARGET_TYPES: LoanTargetType[] = [
  "bill",
  "settlement",
  "cash_advance",
  "expense",
  "loan_out",
  "repayment",
  "intercompany",
];
const FREQUENCIES: LoanPaymentFrequency[] = [
  "weekly",
  "biweekly",
  "semimonthly",
  "monthly",
  "per_settlement",
  "lump_sum",
];
const INTEREST_METHODS: LoanInterestMethod[] = ["none", "simple", "amortized"];

/**
 * Company business date, never UTC. `new Date().toISOString()` rolls over at 00:00 UTC — 6pm CT —
 * so a loan entered on a Texas evening would default to TOMORROW's date and post to the wrong day.
 * verify:acct-utc-today-defaults enforces this across accounting; it caught exactly that here.
 */
function todayIso(): string {
  return companyToday();
}

const EMPTY: FormState = {
  direction: "in",
  relationship: "owner",
  counterparty_kind: "user",
  counterparty_id: "",
  counterparty_name: "",
  account_id: "",
  target_type: "bill",
  target_id: "",
  principal_cents: null,
  entry_date: todayIso(),
  interest_rate_pct: "0",
  interest_method: "none",
  payment_frequency: "monthly",
  payment_count: "",
  first_payment_date: "",
  funding_source_note: "",
};

/** Percent -> basis points (1.25% -> 125 bps). */
export function pctToBps(input: string): number | null {
  const trimmed = input.trim().replace(/%/g, "");
  if (!trimmed) return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  return Math.round(Number(trimmed) * 100);
}

/** Serialise the form into the backend contract. Optional fields are omitted, never sent empty. */
export function buildPayload(form: FormState, operatingCompanyId: string): CreateRelatedPartyLoanRequest | null {
  // MoneyInput already parsed dollars -> integer cents (parseToCents); no second parser here.
  const principal_cents = form.principal_cents;
  const interest_rate_bps = pctToBps(form.interest_rate_pct);
  if (principal_cents === null || principal_cents <= 0) return null;
  if (interest_rate_bps === null) return null;
  if (!form.account_id) return null;

  const payload: CreateRelatedPartyLoanRequest = {
    operating_company_id: operatingCompanyId,
    direction: form.direction,
    relationship: form.relationship,
    counterparty_kind: form.counterparty_kind,
    account_id: form.account_id,
    target_type: form.target_type,
    principal_cents,
    entry_date: form.entry_date,
    interest_rate_bps,
    interest_method: form.interest_method,
    payment_frequency: form.payment_frequency,
  };
  if (form.counterparty_id.trim()) payload.counterparty_id = form.counterparty_id.trim();
  if (form.counterparty_name.trim()) payload.counterparty_name = form.counterparty_name.trim();
  if (form.target_id.trim()) payload.target_id = form.target_id.trim();
  if (form.payment_count.trim()) payload.payment_count = Number(form.payment_count.trim());
  if (form.first_payment_date) payload.first_payment_date = form.first_payment_date;
  if (form.funding_source_note.trim()) payload.funding_source_note = form.funding_source_note.trim();
  return payload;
}

export function LoanApplicationWizard({ open, operatingCompanyId, onClose, onCreated }: Props) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const accountsQuery = useQuery({
    queryKey: ["related-party-loans", "accounts", operatingCompanyId],
    queryFn: () => listCatalogAccounts({ operating_company_id: operatingCompanyId, postable_only: true }),
    enabled: open && Boolean(operatingCompanyId),
  });

  const accounts = accountsQuery.data?.accounts ?? [];
  const accountOptions = useMemo(
    () =>
      accounts.map((a) => ({
        value: a.id,
        label: a.account_number ? `${a.account_number} · ${a.account_name}` : a.account_name,
        type: a.account_type ?? undefined,
      })),
    [accounts]
  );
  const payload = useMemo(() => buildPayload(form, operatingCompanyId), [form, operatingCompanyId]);

  if (!open) return null;

  const directionHelp =
    form.direction === "in"
      ? "Loan TO the company — someone funds a company obligation. A liability rises; pick the liability account."
      : "Loan FROM the company — the company lends out. A receivable asset rises; pick the receivable account.";

  const submit = async () => {
    if (!payload) {
      setError("Principal, interest rate and account are required before submitting.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createRelatedPartyLoan(payload);
      setForm(EMPTY);
      setStep(0);
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6">
      <div className={`${PARITY_MODAL_WIDTH} rounded-sm border border-slate-200 bg-white shadow-lg`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          {/* GLOBAL-TYPE-SIZE-BASELINE.md (locked): column/section headers are 11px/700/UPPERCASE/
              #4B5563 -- same locked-header treatment already applied to ParityDrawer.tsx's title,
              transcribed here, not invented. */}
          <h2
            className="uppercase"
            style={{ fontSize: typography.panelHeader, color: colors.columnHeader, letterSpacing: typography.tightUpper, fontWeight: 700 }}
          >
            Loan / Advance application
          </h2>
          <button type="button" onClick={onClose} className="text-[12px] text-slate-500 hover:text-slate-900">
            Close
          </button>
        </div>

        <div className="flex gap-1 border-b border-slate-200 px-4 py-2">
          {STEPS.map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => setStep(i)}
              className={`rounded-sm px-2 py-1 text-[12px] ${
                i === step ? "bg-[#1f2a44] font-semibold text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {i + 1}. {label}
            </button>
          ))}
        </div>

        <div className="space-y-3 px-4 py-4">
          {step === 0 && (
            <>
              <label className="block text-[12px] font-medium text-slate-700">Direction</label>
              <select
                className={FORM_SELECT_CLASS}
                value={form.direction}
                onChange={(e) => set("direction", e.target.value as LoanDirection)}
              >
                <option value="in">Loan to the company (liability)</option>
                <option value="out">Loan from the company (receivable)</option>
              </select>
              <p className="text-[12px] text-slate-500">{directionHelp}</p>

              <label className="block text-[12px] font-medium text-slate-700">Purpose / target type</label>
              <select
                className={FORM_SELECT_CLASS}
                value={form.target_type}
                onChange={(e) => set("target_type", e.target.value as LoanTargetType)}
              >
                {TARGET_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>

              {/* PICKER-LAW: the funded document (bill / settlement / expense) needs a typed picker
                  per target_type, not a pasted UUID. Until that picker exists the field is NOT
                  rendered — an unrendered field cannot be a rendered-but-unsent field, and a UUID
                  textbox no operator can use is worse than deferring the link. Tracked in REMAINING. */}
            </>
          )}

          {step === 1 && (
            <>
              <label className="block text-[12px] font-medium text-slate-700">Relationship</label>
              <select
                className={FORM_SELECT_CLASS}
                value={form.relationship}
                onChange={(e) => set("relationship", e.target.value as LoanRelationship)}
              >
                {RELATIONSHIPS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>

              <label className="block text-[12px] font-medium text-slate-700">Counterparty kind</label>
              <select
                className={FORM_SELECT_CLASS}
                value={form.counterparty_kind}
                onChange={(e) => set("counterparty_kind", e.target.value as LoanCounterpartyKind)}
              >
                {COUNTERPARTY_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>

              {/* PICKER-LAW: never ask an operator to paste a UUID. The counterparty is chosen with
                  the real picker for its kind — driver picker for drivers, ReferenceSelect (with
                  inline "+ Add new") for vendors. Kinds without a picker (user / company / other) are
                  identified by name only; the id stays empty rather than typed by hand. */}
              {form.counterparty_kind === "driver" && (
                <>
                  <label className="block text-[12px] font-medium text-slate-700">Driver</label>
                  <DriverPickerWithCreate
                    operatingCompanyId={operatingCompanyId}
                    value={form.counterparty_id || null}
                    onChange={(v) => set("counterparty_id", v ?? "")}
                    shell="modal"
                  />
                </>
              )}
              {form.counterparty_kind === "vendor" && (
                <>
                  <label className="block text-[12px] font-medium text-slate-700">Vendor</label>
                  <ReferenceSelect
                    value={form.counterparty_id || null}
                    onChange={(v) => set("counterparty_id", v ?? "")}
                    options={[]}
                    createKind="vendor"
                    operatingCompanyId={operatingCompanyId}
                    placeholder="Select vendor"
                  />
                </>
              )}

              <label className="block text-[12px] font-medium text-slate-700">Counterparty name</label>
              <input
                className={FORM_INPUT_CLASS}
                value={form.counterparty_name}
                onChange={(e) => set("counterparty_name", e.target.value)}
                placeholder="Name as it should read on the register"
              />
            </>
          )}

          {step === 2 && (
            <>
              <label className="block text-[12px] font-medium text-slate-700">Principal (USD)</label>
              {/* Money fields use the shared MoneyInput (verify:money-fields-use-moneyinput) — a raw
                  <input> for a currency amount is exactly how inconsistent parsing/rounding gets in. */}
              <MoneyInput
                valueCents={form.principal_cents}
                onChangeCents={(v) => set("principal_cents", v)}
                placeholder="1200.00"
                ariaLabel="Principal in USD"
              />

              <label className="block text-[12px] font-medium text-slate-700">Loan date</label>
              {/* Shared DatePicker, never a native <input type="date"> (verify:no-raw-date-input):
                  the native box is locale-dependent and does not match the locked US date grammar. */}
              <DatePicker value={form.entry_date} onChange={(v) => set("entry_date", v)} />

              <label className="block text-[12px] font-medium text-slate-700">
                Account {form.direction === "in" ? "(liability)" : "(receivable)"}
              </label>
              {/* ReferenceSelect, not a plain <select> (verify:referenceselect-coverage-ratchet):
                  every accounting-entity dropdown carries the QBO-parity inline "+ Add new ___"
                  create (§7.3) so the operator never has to leave the wizard to add an account. */}
              <ReferenceSelect
                value={form.account_id || null}
                onChange={(v) => set("account_id", v ?? "")}
                options={accountOptions}
                createKind="account"
                operatingCompanyId={operatingCompanyId}
                placeholder="Select an account"
                loading={accountsQuery.isLoading}
                onOptionCreated={() => void accountsQuery.refetch()}
              />
              <p className="text-[12px] text-slate-500">
                No default is applied. The account must be chosen explicitly — an unmapped loan refuses rather
                than posting to a guessed account.
              </p>

              <label className="block text-[12px] font-medium text-slate-700">Funded from (note)</label>
              <textarea
                className={FORM_TEXTAREA_CLASS}
                rows={2}
                value={form.funding_source_note}
                onChange={(e) => set("funding_source_note", e.target.value)}
                placeholder="Which bank / card / personal source funded this"
              />
            </>
          )}

          {step === 3 && (
            <>
              <label className="block text-[12px] font-medium text-slate-700">Interest rate (APR %)</label>
              <input
                className={FORM_INPUT_CLASS}
                value={form.interest_rate_pct}
                onChange={(e) => set("interest_rate_pct", e.target.value)}
                inputMode="decimal"
                placeholder="0"
              />

              <label className="block text-[12px] font-medium text-slate-700">Interest method</label>
              <select
                className={FORM_SELECT_CLASS}
                value={form.interest_method}
                onChange={(e) => set("interest_method", e.target.value as LoanInterestMethod)}
              >
                {INTEREST_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>

              <label className="block text-[12px] font-medium text-slate-700">Payment frequency</label>
              <select
                className={FORM_SELECT_CLASS}
                value={form.payment_frequency}
                onChange={(e) => set("payment_frequency", e.target.value as LoanPaymentFrequency)}
              >
                {FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>

              <label className="block text-[12px] font-medium text-slate-700">Number of payments</label>
              <input
                className={FORM_INPUT_CLASS}
                value={form.payment_count}
                onChange={(e) => set("payment_count", e.target.value)}
                inputMode="numeric"
                placeholder="12"
              />

              <label className="block text-[12px] font-medium text-slate-700">First payment date</label>
              <DatePicker
                value={form.first_payment_date}
                onChange={(v) => set("first_payment_date", v)}
              />
            </>
          )}

          {step === 4 && (
            <>
              <p className="text-[12px] text-slate-600">
                This is the exact request body that will be sent. Every field rendered in the wizard appears
                here — if something you filled in is missing, do not submit.
              </p>
              <pre className="max-h-64 overflow-auto rounded-sm border border-slate-200 bg-slate-50 p-3 text-[12px] text-slate-800">
                {payload
                  ? JSON.stringify(payload, null, 2)
                  : "Incomplete — principal, interest rate and account are required."}
              </pre>
            </>
          )}

          {error && (
            <div className="rounded-sm bg-[#dc2626] px-3 py-2 text-[12px] font-semibold text-white">{error}</div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="rounded-sm border border-gray-300 px-3 py-1.5 text-[12px] text-slate-700 disabled:opacity-40"
          >
            Back
          </button>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              className="rounded-sm bg-[#1f2a44] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#0f1729]"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={submitting || !payload}
              className="rounded-sm bg-[#1f2a44] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#0f1729] disabled:opacity-40"
            >
              {submitting ? "Creating…" : "+ Create"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
