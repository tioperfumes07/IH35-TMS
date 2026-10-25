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
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listCatalogAccounts } from "../../../api/catalog-accounts";
import {
  createRelatedPartyLoan,
  listRelatedPartyLoanFacilities,
  type CreateRelatedPartyLoanRequest,
  type LoanCounterpartyKind,
  type LoanDirection,
  type LoanInterestMethod,
  type LoanPaymentFrequency,
  type LoanRelationship,
  type LoanTargetType,
} from "../../../api/related-party-loans";
import { FORM_INPUT_CLASS, FORM_SELECT_CLASS, FORM_TEXTAREA_CLASS } from "../../../components/forms/inputClass";
import { Modal } from "../../../components/Modal";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import { DatePicker } from "../../../components/forms/DatePicker";
import { companyToday } from "../../../lib/businessDate";
import { ReferenceSelect } from "../../../components/parity/ReferenceSelect";
import { DriverPickerWithCreate } from "../../../components/drivers/DriverPickerWithCreate";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";
import { SelectCombobox } from "../../../components/Combobox";
import { formatAccountDisplayLabel } from "../../../lib/show-account-numbers";
import { useShowAccountNumbers } from "../../../lib/useShowAccountNumbers";
import { formatUsdCents } from "../../../lib/money";

/** ROUND 443.22-2d — repayment / bank_repayment applies cash against a person facility. */
export function isLoanRepaymentTarget(targetType: LoanTargetType | string | null | undefined): boolean {
  return targetType === "repayment" || targetType === "bank_repayment";
}

/** ROUND 443.22-2e — personal-account pay to vendor; no company bank line. */
export function isPaidDirectVendorTarget(targetType: LoanTargetType | string | null | undefined): boolean {
  return targetType === "paid_direct_vendor";
}

/** ROUND 443.22-2a — bank Loan action seeds the wizard; user still confirms rate/person every time. */
export type LoanApplicationPrefill = {
  principal_cents?: number;
  entry_date?: string;
  counterparty_name?: string;
  direction?: LoanDirection;
  funding_source_note?: string;
  bank_transaction_id?: string;
  /** Default 4.00% APR when opened from bank (editable). */
  interest_rate_pct?: string;
  interest_method?: LoanInterestMethod;
  target_type?: LoanTargetType;
  /** ROUND 443.22-2e — debit CoA (Relay Fuel Wallet) when seeded as paid-direct. */
  funding_account_id?: string;
  intermediary_name?: string;
};

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onCreated: () => void;
  prefill?: LoanApplicationPrefill | null;
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
  /** ROUND 443.22-2e — debit account for paid_direct_vendor. */
  funding_account_id: string;
  intermediary_name: string;
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
  "bank_funding",
  "bank_repayment",
  "paid_direct_vendor",
  "party_transfer_out",
];

/** Human labels for purpose — operators never see underscores (00-IH35-LAW plain English). */
const TARGET_TYPE_LABELS: Record<LoanTargetType, string> = {
  bill: "Bill",
  settlement: "Settlement",
  cash_advance: "Cash advance",
  expense: "Expense",
  loan_out: "Loan out",
  repayment: "Repayment",
  intercompany: "Intercompany",
  bank_funding: "Bank funding",
  bank_repayment: "Bank repayment",
  paid_direct_vendor: "Paid directly to a vendor",
  party_transfer_out: "Party transfer out",
  party_paid_vendor: "Party paid a vendor for the company",
};

/** Owner / ROUND 443.22 default annual rate when seeding from bank Categorize → Loan. */
export const BANK_LOAN_DEFAULT_INTEREST_PCT = "4";
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
  funding_account_id: "",
  intermediary_name: "",
};

/** Percent -> basis points (1.25% -> 125 bps). */
export function pctToBps(input: string): number | null {
  const trimmed = input.trim().replace(/%/g, "");
  if (!trimmed) return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  return Math.round(Number(trimmed) * 100);
}

/** Serialise the form into the backend contract. Optional fields are omitted, never sent empty. */
export function buildPayload(
  form: FormState,
  operatingCompanyId: string,
  bankTransactionId?: string | null,
): CreateRelatedPartyLoanRequest | null {
  // MoneyInput already parsed dollars -> integer cents (parseToCents); no second parser here.
  const principal_cents = form.principal_cents;
  const interest_rate_bps = pctToBps(form.interest_rate_pct);
  if (principal_cents === null || principal_cents <= 0) return null;
  if (interest_rate_bps === null) return null;
  if (!form.account_id) return null;
  const paidDirect = isPaidDirectVendorTarget(form.target_type);
  if (paidDirect && !form.funding_account_id.trim()) return null;

  const payload: CreateRelatedPartyLoanRequest = {
    operating_company_id: operatingCompanyId,
    // Paid-direct is always money IN to the company (person funded a vendor for us).
    direction: paidDirect ? "in" : form.direction,
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
  // Paid-direct never stamps a bank reverse pointer (no company bank line).
  if (!paidDirect && bankTransactionId?.trim()) payload.bank_transaction_id = bankTransactionId.trim();
  if (paidDirect && form.funding_account_id.trim()) {
    payload.funding_account_id = form.funding_account_id.trim();
  }
  if (paidDirect && form.intermediary_name.trim()) {
    payload.intermediary_name = form.intermediary_name.trim();
  }
  return payload;
}

function formFromPrefill(prefill: LoanApplicationPrefill | null | undefined): FormState {
  if (!prefill) return { ...EMPTY, entry_date: todayIso() };
  const paidDirect = isPaidDirectVendorTarget(prefill.target_type);
  return {
    ...EMPTY,
    direction: paidDirect ? "in" : (prefill.direction ?? "in"),
    counterparty_name: prefill.counterparty_name?.trim() ?? "",
    principal_cents: typeof prefill.principal_cents === "number" ? prefill.principal_cents : null,
    entry_date: prefill.entry_date?.slice(0, 10) || todayIso(),
    interest_rate_pct: prefill.interest_rate_pct ?? BANK_LOAN_DEFAULT_INTEREST_PCT,
    interest_method: prefill.interest_method ?? "simple",
    target_type: prefill.target_type ?? (prefill.bank_transaction_id ? "bank_funding" : "bill"),
    funding_source_note: prefill.funding_source_note?.trim() ?? "",
    funding_account_id: prefill.funding_account_id?.trim() ?? "",
    intermediary_name: prefill.intermediary_name?.trim() ?? "",
  };
}

export function LoanApplicationWizard({ open, operatingCompanyId, onClose, onCreated, prefill }: Props) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(() => formFromPrefill(prefill));
  const [bankTransactionId, setBankTransactionId] = useState<string | null>(prefill?.bank_transaction_id ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAccountNumbers] = useShowAccountNumbers();

  useEffect(() => {
    if (!open) return;
    setForm(formFromPrefill(prefill));
    setBankTransactionId(prefill?.bank_transaction_id ?? null);
    setStep(0);
    setError(null);
  }, [open, prefill]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const isRepayment = isLoanRepaymentTarget(form.target_type);
  const isPaidDirect = isPaidDirectVendorTarget(form.target_type);

  const accountsQuery = useQuery({
    queryKey: ["related-party-loans", "accounts", operatingCompanyId],
    queryFn: () => listCatalogAccounts({ operating_company_id: operatingCompanyId, postable_only: true }),
    enabled: open && Boolean(operatingCompanyId),
  });

  // ROUND 443.22-2d — load facilities so Apply repayment can show open balance and STOP overpay.
  const facilitiesQuery = useQuery({
    queryKey: ["related-party-loans", "facilities", operatingCompanyId],
    queryFn: () => listRelatedPartyLoanFacilities(operatingCompanyId),
    enabled: open && Boolean(operatingCompanyId) && isRepayment,
  });

  const accounts = accountsQuery.data?.accounts ?? [];
  const facilities = facilitiesQuery.data?.facilities ?? [];
  const matchedFacility = useMemo(() => {
    if (!isRepayment || !form.account_id) return null;
    return facilities.find((f) => f.account_id === form.account_id) ?? null;
  }, [facilities, form.account_id, isRepayment]);
  const facilityOpenBalanceCents = matchedFacility?.open_balance_cents ?? null;
  const overpayBlocked =
    isRepayment &&
    facilityOpenBalanceCents != null &&
    form.principal_cents != null &&
    form.principal_cents > facilityOpenBalanceCents;

  const accountOptions = useMemo(
    () =>
      accounts.map((a) => ({
        value: a.id,
        label: formatAccountDisplayLabel(
          { account_name: a.account_name, account_number: a.account_number },
          { showNumber: showAccountNumbers },
        ),
        type: a.account_type ?? undefined,
      })),
    [accounts, showAccountNumbers]
  );
  const payload = useMemo(
    () => buildPayload(form, operatingCompanyId, bankTransactionId),
    [form, operatingCompanyId, bankTransactionId],
  );

  if (!open) return null;

  const directionHelp = isRepayment
    ? "Apply repayment — cash leaves the company against the person's open facility balance. Pick the same liability (or receivable) account as the facility. Overpay is refused."
    : isPaidDirect
      ? "Paid directly to a vendor — a related party paid a vendor from a personal account. No company bank line. Adds an advance to that person's facility and debits what was paid for (for example Relay Fuel Wallet)."
      : form.direction === "in"
        ? "Loan TO the company — someone funds a company obligation. A liability rises; pick the liability account."
        : "Loan FROM the company — the company lends out. A receivable asset rises; pick the receivable account.";

  const submit = async () => {
    if (!payload) {
      setError(
        isPaidDirect
          ? "Principal, interest rate, lender liability account, and debit account (what was paid for) are required before submitting."
          : "Principal, interest rate and account are required before submitting.",
      );
      return;
    }
    if (overpayBlocked) {
      setError(
        `Repayment exceeds facility open balance of ${formatUsdCents(facilityOpenBalanceCents)}. Stop — do not overpay.`,
      );
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createRelatedPartyLoan(payload);
      setForm({ ...EMPTY, entry_date: todayIso() });
      setBankTransactionId(null);
      setStep(0);
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setSubmitting(false);
    }
  };

  const wizardTitle = isRepayment
    ? "Apply loan repayment"
    : isPaidDirect
      ? "Paid directly to a vendor"
      : "Loan / Advance application";

  return (
    <Modal open={open} onClose={onClose} title={wizardTitle} size="md" modalKind="loan-application-wizard" wide>
      <div className="space-y-0 text-xs" data-testid="loan-wizard-title">
        {bankTransactionId && !isPaidDirect ? (
          <div
            className="border-b border-[#E5E7EB] bg-[#F7F8FA] px-4 py-2 text-xs text-[#1F2A44]"
            data-testid="loan-wizard-bank-prefill-banner"
          >
            {isRepayment
              ? "Seeded from a bank money-out line as Apply repayment. Confirm the person, facility account, and amount — overpay is refused."
              : `Seeded from a bank line at ${form.interest_rate_pct || BANK_LOAN_DEFAULT_INTEREST_PCT}% APR. Confirm the person, account, and rate — nothing posts until you submit.`}
          </div>
        ) : null}
        {isPaidDirect ? (
          <div
            className="border-b border-[#E5E7EB] bg-[#F7F8FA] px-4 py-2 text-xs text-[#1F2A44]"
            data-testid="loan-wizard-paid-direct-banner"
          >
            No company bank line. Name the lender (facility), debit what was paid for, and optionally record who paid as intermediary. Same advance note as a normal funding.
          </div>
        ) : null}

        <div className="flex gap-1 border-b border-[#E5E7EB] px-4 py-2">
          {STEPS.map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => setStep(i)}
              className={`rounded-sm px-2 py-1 text-xs ${
                i === step ? "bg-[#1F2A44] font-semibold text-white" : "text-[#4B5563] hover:bg-[#F7F8FA]"
              }`}
            >
              {i + 1}. {label}
            </button>
          ))}
        </div>

        <div className="space-y-3 px-4 py-4">
          {step === 0 && (
            <>
              <label className="block text-xs font-medium text-[#1F2A44]">Direction</label>
              <SelectCombobox
                className={FORM_SELECT_CLASS}
                value={isPaidDirect ? "in" : form.direction}
                onChange={(e) => set("direction", e.target.value as LoanDirection)}
                disabled={isPaidDirect}
                data-testid="loan-wizard-direction"
              >
                <option value="in">Loan to the company (liability)</option>
                <option value="out">Loan from the company (receivable)</option>
              </SelectCombobox>
              <p className="text-xs text-[#6B7280]">{directionHelp}</p>

              <label className="block text-xs font-medium text-[#1F2A44]">Purpose / target type</label>
              <SelectCombobox
                className={FORM_SELECT_CLASS}
                value={form.target_type}
                onChange={(e) => {
                  const next = e.target.value as LoanTargetType;
                  set("target_type", next);
                  if (isPaidDirectVendorTarget(next)) set("direction", "in");
                }}
                data-testid="loan-wizard-target-type"
              >
                {TARGET_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TARGET_TYPE_LABELS[t]}
                  </option>
                ))}
              </SelectCombobox>

              {/* PICKER-LAW: the funded document (bill / settlement / expense) needs a typed picker
                  per target_type, not a pasted UUID. Until that picker exists the field is NOT
                  rendered — an unrendered field cannot be a rendered-but-unsent field, and a UUID
                  textbox no operator can use is worse than deferring the link. Tracked in REMAINING. */}
            </>
          )}

          {step === 1 && (
            <>
              <label className="block text-xs font-medium text-[#1F2A44]">Relationship</label>
              <SelectCombobox
                className={FORM_SELECT_CLASS}
                value={form.relationship}
                onChange={(e) => set("relationship", e.target.value as LoanRelationship)}
              >
                {RELATIONSHIPS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </SelectCombobox>

              <label className="block text-xs font-medium text-[#1F2A44]">Counterparty kind</label>
              <SelectCombobox
                className={FORM_SELECT_CLASS}
                value={form.counterparty_kind}
                onChange={(e) => set("counterparty_kind", e.target.value as LoanCounterpartyKind)}
              >
                {COUNTERPARTY_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </SelectCombobox>

              {/* PICKER-LAW: never ask an operator to paste a UUID. The counterparty is chosen with
                  the real picker for its kind — driver picker for drivers, ReferenceSelect (with
                  inline "+ Add new") for vendors. Kinds without a picker (user / company / other) are
                  identified by name only; the id stays empty rather than typed by hand. */}
              {form.counterparty_kind === "driver" && (
                <>
                  <label className="block text-xs font-medium text-[#1F2A44]">Driver</label>
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
                  <label className="block text-xs font-medium text-[#1F2A44]">Vendor</label>
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

              <label className="block text-xs font-medium text-[#1F2A44]">Counterparty name</label>
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
              <label className="block text-xs font-medium text-[#1F2A44]">Principal (USD)</label>
              {/* Money fields use the shared MoneyInput (verify:money-fields-use-moneyinput) — a raw
                  <input> for a currency amount is exactly how inconsistent parsing/rounding gets in. */}
              <MoneyInput
                valueCents={form.principal_cents}
                onChangeCents={(v) => set("principal_cents", v)}
                placeholder="1200.00"
                ariaLabel="Principal in USD"
              />

              <label className="block text-xs font-medium text-[#1F2A44]">Loan date</label>
              {/* Shared DatePicker, never a native <input type="date"> (verify:no-raw-date-input):
                  the native box is locale-dependent and does not match the locked US date grammar. */}
              <DatePicker value={form.entry_date} onChange={(v) => set("entry_date", v)} />

              <label className="block text-xs font-medium text-[#1F2A44]">
                Account{" "}
                {isRepayment
                  ? "(facility being repaid)"
                  : isPaidDirect || form.direction === "in"
                    ? "(lender liability / facility)"
                    : "(receivable)"}
              </label>
              {/* ReferenceSelect, not a plain <SelectCombobox> (verify:referenceselect-coverage-ratchet):
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
              {form.account_id ? (
                <EntityLink
                  kind="account"
                  id={form.account_id}
                  label={entityLabel(
                    accounts.find((a) => a.id === form.account_id)?.account_name,
                    form.account_id,
                    "Account",
                  )}
                  className="mt-1 block text-xs font-semibold text-[#1F2A44] underline"
                />
              ) : null}
              {isPaidDirect ? (
                <div className="space-y-2" data-testid="loan-wizard-paid-direct-fields">
                  <label className="block text-xs font-medium text-[#1F2A44]">
                    Debit account (what was paid for)
                  </label>
                  <ReferenceSelect
                    value={form.funding_account_id || null}
                    onChange={(v) => set("funding_account_id", v ?? "")}
                    options={accountOptions}
                    createKind="account"
                    operatingCompanyId={operatingCompanyId}
                    placeholder="e.g. Relay Fuel Wallet"
                    loading={accountsQuery.isLoading}
                    onOptionCreated={() => void accountsQuery.refetch()}
                  />
                  {form.funding_account_id ? (
                    <EntityLink
                      kind="account"
                      id={form.funding_account_id}
                      label={entityLabel(
                        accounts.find((a) => a.id === form.funding_account_id)?.account_name,
                        form.funding_account_id,
                        "Account",
                      )}
                      className="mt-1 block text-xs font-semibold text-[#1F2A44] underline"
                    />
                  ) : null}
                  <p className="text-xs text-[#6B7280]">
                    Required. This is the CoA account debited — Relay Fuel Wallet when Relay was funded,
                    or the prepaid / expense that the personal payment covered.
                  </p>
                  <label className="block text-xs font-medium text-[#1F2A44]">
                    Intermediary (optional)
                  </label>
                  <input
                    className={FORM_INPUT_CLASS}
                    value={form.intermediary_name}
                    onChange={(e) => set("intermediary_name", e.target.value)}
                    placeholder="Who paid from a personal account (e.g. Alberto)"
                    data-testid="loan-wizard-intermediary-name"
                  />
                  <p className="text-xs text-[#6B7280]">
                    Lender is the counterparty name on the previous step. Intermediary is recorded on the
                    advance when someone else paid on the lender&apos;s behalf.
                  </p>
                </div>
              ) : null}
              {isRepayment ? (
                <div
                  className="bg-[#F7F8FA] px-3 py-2 text-xs text-[#1F2A44]"
                  data-testid="loan-wizard-facility-open-balance"
                >
                  {facilitiesQuery.isLoading
                    ? "Loading facility open balance…"
                    : facilityOpenBalanceCents == null
                      ? form.account_id
                        ? "No open facility for this account yet — repayment of a zero balance is refused."
                        : "Pick the facility account to see open balance."
                      : `Facility open balance: ${formatUsdCents(facilityOpenBalanceCents)}${
                          matchedFacility?.counterparty_name
                            ? ` · ${matchedFacility.counterparty_name}`
                            : ""
                        }`}
                  {overpayBlocked ? (
                    <p className="mt-1 font-semibold text-red-700" data-testid="loan-wizard-overpay-stop">
                      Repayment exceeds open balance. Stop — do not overpay.
                    </p>
                  ) : null}
                </div>
              ) : null}
              <p className="text-xs text-[#6B7280]">
                No default is applied. The account must be chosen explicitly — an unmapped loan refuses rather
                than posting to a guessed account.
              </p>

              <label className="block text-xs font-medium text-[#1F2A44]">Funded from (note)</label>
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
              <label className="block text-xs font-medium text-[#1F2A44]">Interest rate (APR %)</label>
              <input
                className={FORM_INPUT_CLASS}
                value={form.interest_rate_pct}
                onChange={(e) => set("interest_rate_pct", e.target.value)}
                inputMode="decimal"
                placeholder={BANK_LOAN_DEFAULT_INTEREST_PCT}
                data-testid="loan-wizard-interest-rate"
              />
              <p className="text-xs text-[#6B7280]">
                Default {BANK_LOAN_DEFAULT_INTEREST_PCT}.00% when opened from Bank → Loan; change it before submit if needed.
              </p>

              <label className="block text-xs font-medium text-[#1F2A44]">Interest method</label>
              <SelectCombobox
                className={FORM_SELECT_CLASS}
                value={form.interest_method}
                onChange={(e) => set("interest_method", e.target.value as LoanInterestMethod)}
              >
                {INTEREST_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </SelectCombobox>

              <label className="block text-xs font-medium text-[#1F2A44]">Payment frequency</label>
              <SelectCombobox
                className={FORM_SELECT_CLASS}
                value={form.payment_frequency}
                onChange={(e) => set("payment_frequency", e.target.value as LoanPaymentFrequency)}
              >
                {FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </SelectCombobox>

              <label className="block text-xs font-medium text-[#1F2A44]">Number of payments</label>
              <input
                className={FORM_INPUT_CLASS}
                value={form.payment_count}
                onChange={(e) => set("payment_count", e.target.value)}
                inputMode="numeric"
                placeholder="12"
              />

              <label className="block text-xs font-medium text-[#1F2A44]">First payment date</label>
              <DatePicker
                value={form.first_payment_date}
                onChange={(v) => set("first_payment_date", v)}
              />
            </>
          )}

          {step === 4 && (
            <>
              <p className="text-xs text-[#4B5563]">
                This is the exact request body that will be sent. Every field rendered in the wizard appears
                here — if something you filled in is missing, do not submit.
              </p>
              <pre className="max-h-64 overflow-auto rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] p-3 text-xs text-[#1F2A44]">
                {payload
                  ? JSON.stringify(payload, null, 2)
                  : "Incomplete — principal, interest rate and account are required."}
              </pre>
            </>
          )}

          {error && (
            <div className="rounded-sm bg-red-600 px-3 py-2 text-xs font-semibold text-white">{error}</div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[#E5E7EB] px-4 py-3">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="rounded-sm border border-gray-300 px-3 py-1.5 text-xs text-[#1F2A44] disabled:opacity-40"
          >
            Back
          </button>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              className="rounded-sm bg-[#1F2A44] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0F1729]"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={submitting || !payload || overpayBlocked}
              className="rounded-sm bg-[#1F2A44] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0F1729] disabled:opacity-40"
              data-testid="loan-wizard-submit"
            >
              {submitting ? "Creating…" : isRepayment ? "Apply repayment" : "+ Create"}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
