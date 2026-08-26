import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { userFacingApiError } from "../../../lib/api-error-message";
import { getPlaidCompanyTransactions } from "../../../api/banking";
import {
  contestSafetyFine,
  dismissSafetyFine,
  linkSafetyFinePayment,
  reduceSafetyFine,
} from "../../../api/safety";
import { useAuth } from "../../../auth/useAuth";
import { DatePicker } from "../../../components/forms/DatePicker";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import { Combobox } from "../../../components/shared/Combobox";
import { companyToday } from "../../../lib/businessDate";
import { formatDateUS } from "../../../lib/formatDate";
import { CappedListNotice } from "../../../components/CappedListNotice";

// ── SAF-B12 ──────────────────────────────────────────────────────────────────────────────────────
// Four external-fine lifecycle routes on safety.civil_fines were fully built and audited in
// apps/backend/src/safety/fines.routes.ts (contest :463, dismiss :494, reduce :525, link-payment :616)
// and had ZERO frontend callers. The only action the drawer offered was "Convert to Driver Liability",
// so a wrongly-issued authority citation could not be contested or dismissed at all — the operator's
// only exit was to push it onto a driver.
//
// Every gate below is TRANSCRIBED from the route handler, not invented. Where the server has no state
// predicate, neither does this UI: inventing a client-side rule the server does not hold would silently
// block a lawful action. Where the server DOES refuse, the control is disabled and states the server's
// own reason, so the operator reads the rule instead of a 500.

type Props = {
  fine: Record<string, unknown>;
  operatingCompanyId: string;
  /** Invalidate the fines query after any lifecycle write. */
  onUpdated: () => void;
};

/** Mirrors canMutate() in fines.routes.ts — ["Owner", "Administrator", "Safety"]. */
const FINE_MUTATE_ROLES = ["Owner", "Administrator", "Safety"];

/** Surface the server's own error/message body (409 fine_already_converted_to_liability, etc.). */
function apiErrorText(error: unknown): string {
  return userFacingApiError(error, "Request failed");
}

export function FineLifecycleActions({ fine, operatingCompanyId, onUpdated }: Props) {
  const { user } = useAuth();
  const fineId = String(fine.id ?? "");

  const [notes, setNotes] = useState("");
  const [reduceAmountCents, setReduceAmountCents] = useState<number | null>(null);
  const [reduceReason, setReduceReason] = useState("");
  const [bankTransactionId, setBankTransactionId] = useState<string | null>(null);
  const [bankSearch, setBankSearch] = useState("");
  const [paidDate, setPaidDate] = useState(companyToday());
  const [paidAmountCents, setPaidAmountCents] = useState<number | null>(Number(fine.amount_cents ?? 0));

  // SAFETY-MONEY-F6634-FINE-LIFECYCLE-MUTABLE-RECORD-COMPANY-DRAFT-SCOPE — contest, dismiss,
  // reduce, and link-payment were all zero-argument mutations that closed over the LIVE
  // (mutable) fineId/operatingCompanyId/draft fields. Switching fine or company — or editing a
  // draft — while any of these liability/GL-bearing requests is in flight could submit or
  // disclose completion against a different record than the operator intended. Same scope-
  // generation-snapshot idiom already shipped 5 times this session (UnitPermitsTab,
  // PaymentScheduleTab, WOTimeTrackingPanel, EscrowRecordTab, PartsInventoryTable).
  const scopeGenerationRef = useRef(0);

  // ── server-mirrored state gates ────────────────────────────────────────────────────────────────
  // contest  (fines.routes.ts:463): UPDATE ... WHERE id = $1 AND operating_company_id = $2 AND voided_at IS NULL
  // dismiss  (fines.routes.ts:494): identical predicate.
  // reduce   (fines.routes.ts:525): refuses on voided_at (409 fine_voided) AND on a non-null
  //           converted_to_liability_id (409 fine_already_converted_to_liability, OWNER RULING
  //           2026-07-23 Option B — the liability holds its own copy of the amount).
  // link-payment (fines.routes.ts:616): WHERE id = $1 AND operating_company_id = $2 — the server holds
  //           NO state predicate here, so this UI adds none either.
  //
  // NOTE: safety.civil_fines.voided_at ships in the HELD migration 202607110200_civil_fines_voidable.sql.
  // If that migration is not applied, `SELECT cf.*` simply omits the key and Boolean(undefined) === false,
  // i.e. "not voided" — which is exactly right for a table that cannot be voided yet.
  const isVoided = Boolean(fine.voided_at);
  const convertedLiabilityId = fine.converted_to_liability_id ? String(fine.converted_to_liability_id) : null;

  const VOIDED_REASON = "This fine is voided. A voided record is immutable and cannot be changed.";
  const statusBlockedReason = isVoided ? VOIDED_REASON : null;
  const reduceBlockedReason = isVoided
    ? VOIDED_REASON
    : convertedLiabilityId
      ? "This fine has already been converted to a driver liability, which holds its own copy of the amount. " +
        "Reducing it here would leave the driver owing the original amount. Reverse the driver liability " +
        "first, then reduce the fine and convert again."
      : null;

  const canMutate = FINE_MUTATE_ROLES.includes(String(user?.role ?? ""));

  // Bank-transaction picker for link-payment. Company-wide, searchable, read-only GET — the same
  // source the Banking connections register uses. A bank transaction is a bank-fed fact, never
  // hand-created here, so this dropdown carries no inline "+ Create" affordance by design.
  const bankTxQuery = useQuery({
    queryKey: ["banking", "company-transactions", "fine-payment-picker", operatingCompanyId, bankSearch],
    queryFn: () =>
      getPlaidCompanyTransactions(operatingCompanyId, {
        limit: 100,
        q: bankSearch.trim() ? bankSearch.trim() : undefined,
        sort: "date_desc",
      }),
    enabled: Boolean(operatingCompanyId) && canMutate,
  });

  const bankOptions = useMemo(
    () =>
      (bankTxQuery.data?.transactions ?? []).map((tx) => ({
        value: String(tx.id),
        label: `${formatDateUS(tx.transaction_date)} · $${(Math.abs(Number(tx.amount_cents ?? 0)) / 100).toFixed(2)} · ${
          tx.merchant_name ?? tx.description ?? "(no description)"
        }`,
      })),
    [bankTxQuery.data]
  );

  type LifecycleScope = { fineId: string; operatingCompanyId: string; generation: number };

  const contestMutation = useMutation({
    mutationFn: (input: LifecycleScope & { notes: string }) => contestSafetyFine(input.fineId, input.operatingCompanyId, input.notes),
    onSuccess: (_data, input) => {
      if (input.generation !== scopeGenerationRef.current) return;
      setNotes("");
      onUpdated();
    },
  });

  const dismissMutation = useMutation({
    mutationFn: (input: LifecycleScope & { notes: string }) => dismissSafetyFine(input.fineId, input.operatingCompanyId, input.notes),
    onSuccess: (_data, input) => {
      if (input.generation !== scopeGenerationRef.current) return;
      setNotes("");
      onUpdated();
    },
  });

  const reduceMutation = useMutation({
    mutationFn: (input: LifecycleScope & { amountCents: number; reason: string }) =>
      reduceSafetyFine(input.fineId, input.operatingCompanyId, {
        amount_cents: input.amountCents,
        reason: input.reason,
      }),
    onSuccess: (_data, input) => {
      if (input.generation !== scopeGenerationRef.current) return;
      setReduceAmountCents(null);
      setReduceReason("");
      onUpdated();
    },
  });

  const linkPaymentMutation = useMutation({
    mutationFn: (input: LifecycleScope & { bankTransactionId: string; paidDate: string; paidAmountCents: number }) =>
      linkSafetyFinePayment(input.fineId, input.operatingCompanyId, {
        bank_transaction_id: input.bankTransactionId,
        paid_date: input.paidDate,
        paid_amount_cents: input.paidAmountCents,
      }),
    onSuccess: (_data, input) => {
      if (input.generation !== scopeGenerationRef.current) return;
      setBankTransactionId(null);
      onUpdated();
    },
  });

  const resetContestMutation = contestMutation.reset;
  const resetDismissMutation = dismissMutation.reset;
  const resetReduceMutation = reduceMutation.reset;
  const resetLinkPaymentMutation = linkPaymentMutation.reset;

  useEffect(() => {
    scopeGenerationRef.current += 1;
    resetContestMutation();
    resetDismissMutation();
    resetReduceMutation();
    resetLinkPaymentMutation();
    setNotes("");
    setReduceAmountCents(null);
    setReduceReason("");
    setBankTransactionId(null);
    setBankSearch("");
    setPaidDate(companyToday());
    setPaidAmountCents(Number(fine.amount_cents ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset effect keys ONLY on record/company identity, not on fine's own mutable fields (amount_cents is read once as the reset default, not a reactive dependency).
  }, [fineId, operatingCompanyId, resetContestMutation, resetDismissMutation, resetReduceMutation, resetLinkPaymentMutation]);

  if (!canMutate) {
    return (
      <div
        className="mt-4 rounded-sm border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600"
        data-testid="fine-lifecycle-actions-forbidden"
      >
        Contest, dismiss, reduce and payment-link are limited to Owner, Administrator and Safety roles.
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3" data-testid="fine-lifecycle-actions">
      {/* ── Contest / Dismiss ─────────────────────────────────────────────────────────────────── */}
      <div className="rounded-sm border border-slate-200 bg-slate-50 p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Contest or Dismiss</div>
        <p className="mt-1 text-xs text-slate-600">
          Contest records that this citation is being challenged with the issuing authority. Dismiss records
          that it was thrown out or withdrawn. Neither moves money.
        </p>
        <label className="mt-2 block text-xs font-medium text-slate-700">
          Notes (optional)
          <textarea
            className="mt-1 w-full rounded-sm border border-slate-300 px-2 py-2 text-xs"
            rows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Docket number, hearing date, who withdrew it…"
            data-testid="fine-status-notes"
          />
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-sm bg-[#1f2a44] px-3 py-1 text-xs font-semibold text-white hover:bg-[#0f1729] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={Boolean(statusBlockedReason) || contestMutation.isPending}
            title={statusBlockedReason ?? undefined}
            onClick={() => contestMutation.mutate({ fineId, operatingCompanyId, generation: scopeGenerationRef.current, notes })}
            data-testid="fine-contest-btn"
          >
            {contestMutation.isPending ? "Contesting…" : "Contest Fine"}
          </button>
          <button
            type="button"
            className="rounded-sm bg-slate-700 px-3 py-1 text-xs font-semibold text-white hover:bg-[#334155] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={Boolean(statusBlockedReason) || dismissMutation.isPending}
            title={statusBlockedReason ?? undefined}
            onClick={() => dismissMutation.mutate({ fineId, operatingCompanyId, generation: scopeGenerationRef.current, notes })}
            data-testid="fine-dismiss-btn"
          >
            {dismissMutation.isPending ? "Dismissing…" : "Dismiss Fine"}
          </button>
        </div>
        {statusBlockedReason ? (
          <p className="mt-2 text-xs text-slate-600" data-testid="fine-status-blocked-reason">
            {statusBlockedReason}
          </p>
        ) : null}
        {contestMutation.isError ? (
          <p className="mt-2 text-xs text-[#dc2626]" data-testid="fine-contest-error">
            {apiErrorText(contestMutation.error)}
          </p>
        ) : null}
        {dismissMutation.isError ? (
          <p className="mt-2 text-xs text-[#dc2626]" data-testid="fine-dismiss-error">
            {apiErrorText(dismissMutation.error)}
          </p>
        ) : null}
      </div>

      {/* ── Reduce ────────────────────────────────────────────────────────────────────────────── */}
      <div className="rounded-sm border border-slate-200 bg-slate-50 p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Reduce Amount</div>
        {reduceBlockedReason ? (
          <p className="mt-1 text-xs text-slate-600" data-testid="fine-reduce-blocked-reason">
            {reduceBlockedReason}
          </p>
        ) : (
          <p className="mt-1 text-xs text-slate-600">
            Records a negotiated or court-ordered reduction. The reason is appended to the fine's notes.
          </p>
        )}
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <label className="text-xs font-medium text-slate-700">
            New Amount (USD)
            <MoneyInput
              valueCents={reduceAmountCents}
              onChangeCents={setReduceAmountCents}
              ariaLabel="Reduced fine amount (USD)"
              disabled={Boolean(reduceBlockedReason)}
              className="mt-1 w-full"
            />
          </label>
          <label className="text-xs font-medium text-slate-700">
            Reason (required)
            <input
              type="text"
              className="mt-1 h-9 w-full rounded-sm border border-slate-300 px-2 text-xs"
              value={reduceReason}
              onChange={(event) => setReduceReason(event.target.value)}
              disabled={Boolean(reduceBlockedReason)}
              placeholder="Court reduced on first-offense plea"
              data-testid="fine-reduce-reason"
            />
          </label>
        </div>
        <div className="mt-2">
          <button
            type="button"
            className="rounded-sm bg-[#1f2a44] px-3 py-1 text-xs font-semibold text-white hover:bg-[#0f1729] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={
              Boolean(reduceBlockedReason) ||
              reduceMutation.isPending ||
              reduceAmountCents == null ||
              reduceAmountCents < 0 ||
              reduceReason.trim().length < 1
            }
            title={reduceBlockedReason ?? undefined}
            onClick={() =>
              reduceMutation.mutate({
                fineId,
                operatingCompanyId,
                generation: scopeGenerationRef.current,
                amountCents: reduceAmountCents ?? 0,
                reason: reduceReason.trim(),
              })
            }
            data-testid="fine-reduce-btn"
          >
            {reduceMutation.isPending ? "Reducing…" : "Reduce Fine"}
          </button>
        </div>
        {reduceMutation.isError ? (
          <p className="mt-2 text-xs text-[#dc2626]" data-testid="fine-reduce-error">
            {apiErrorText(reduceMutation.error)}
          </p>
        ) : null}
      </div>

      {/* ── Link Bank Payment ─────────────────────────────────────────────────────────────────── */}
      <div className="rounded-sm border border-slate-200 bg-slate-50 p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Link Bank Payment</div>
        <p className="mt-1 text-xs text-slate-600">
          Points this fine at the bank transaction that paid it and marks it paid. This records the linkage
          only — it posts no journal entry.
        </p>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <label className="text-xs font-medium text-slate-700 md:col-span-2">
            Bank Transaction
            <div className="mt-1" data-testid="fine-payment-bank-transaction-picker">
              <Combobox
                options={bankOptions}
                value={bankTransactionId}
                onChange={setBankTransactionId}
                onSearch={setBankSearch}
                placeholder={bankTxQuery.isLoading ? "Loading bank transactions…" : "Search by description or merchant…"}
              />
            </div>
            <CappedListNotice
              shown={bankOptions.length}
              limit={100}
              hint="Type to search bank transactions beyond the first page."
              className="mt-1 text-xs text-slate-600"
            />
          </label>
          <div className="text-xs font-medium text-slate-700">
            <label htmlFor="fine-payment-paid-date">Paid Date</label>
            <DatePicker
              id="fine-payment-paid-date"
              value={paidDate}
              onChange={setPaidDate}
              className="mt-1 w-full"
              data-testid="fine-payment-paid-date"
            />
          </div>
          <label className="text-xs font-medium text-slate-700">
            Paid Amount (USD)
            <MoneyInput
              valueCents={paidAmountCents}
              onChangeCents={setPaidAmountCents}
              ariaLabel="Paid amount (USD)"
              className="mt-1 w-full"
            />
          </label>
        </div>
        <div className="mt-2">
          <button
            type="button"
            className="rounded-sm bg-[#1f2a44] px-3 py-1 text-xs font-semibold text-white hover:bg-[#0f1729] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={
              linkPaymentMutation.isPending ||
              !bankTransactionId ||
              !paidDate ||
              paidAmountCents == null ||
              paidAmountCents < 0
            }
            onClick={() =>
              linkPaymentMutation.mutate({
                fineId,
                operatingCompanyId,
                generation: scopeGenerationRef.current,
                bankTransactionId: String(bankTransactionId ?? ""),
                paidDate,
                paidAmountCents: paidAmountCents ?? 0,
              })
            }
            data-testid="fine-link-payment-btn"
          >
            {linkPaymentMutation.isPending ? "Linking…" : "Link Payment & Mark Paid"}
          </button>
        </div>
        {bankTxQuery.isError ? (
          <p className="mt-2 text-xs text-[#dc2626]" data-testid="fine-payment-picker-error">
            Couldn't load bank transactions: {apiErrorText(bankTxQuery.error)}
          </p>
        ) : null}
        {linkPaymentMutation.isError ? (
          <p className="mt-2 text-xs text-[#dc2626]" data-testid="fine-link-payment-error">
            {apiErrorText(linkPaymentMutation.error)}
          </p>
        ) : null}
      </div>
    </div>
  );
}
