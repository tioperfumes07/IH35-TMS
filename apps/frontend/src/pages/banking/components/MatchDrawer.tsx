import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  acceptBankReconMatch,
  acceptBankReconMultiMatch,
  categorizeBankTransaction,
  getCoaAccounts,
  getMatchCandidates,
  type BankMatchCandidate,
  type BankMatchCandidateKind,
} from "../../../api/banking";
import { listVendors } from "../../../api/mdata";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { EntityLink, type EntityKind } from "../../../components/shared/EntityLink";
import { ParityDrawer } from "../../../components/parity/ParityDrawer";
import { ReferenceSelect } from "../../../components/parity/ReferenceSelect";
import { coaAccountReferenceOption, vendorReferenceOption } from "../../../components/parity/referenceOptionLabels";
import { DatePicker } from "../../../components/forms/DatePicker";
import { useToast } from "../../../components/Toast";
import { useListState } from "../../../components/list-state";
import { formatUsdCents } from "../../../lib/money";
import { userFacingApiError } from "../../../lib/api-error-message";

// ROUND 206 Resolve (owner asked 4×): exact Confirm stays link-and-clear; variance Confirm is enabled
// when a write-off / difference account is selected (posts via acceptMatchWithResolveDifference);
// multi-select exact sum → acceptExactMultiDocumentMatch (one bank line → many documents).
// "bill" still held (CHAIN-04 Part 2b).
const VARIANCE_NEEDS_WRITEOFF = "Select a write-off / difference account to resolve this variance";

/** ROUND 189 Resolve — named difference accounts only (never a generic "adjustment").
 * Match by account_name (not account_number) so the Account-Numbers-Hidden law stays green.
 */
const NAMED_RESOLVE_QUICK_PICKS: ReadonlyArray<{ label: string; account_name: string; testId: string }> = [
  { label: "Reserve Deposit", account_name: "Faro Cash Reserve", testId: "reserve-deposit" },
  { label: "Factoring Fees", account_name: "Factoring Fees", testId: "factoring-fees" },
  { label: "Wire Fee", account_name: "Bank Service Charges & Wire Fees", testId: "wire-fee" },
  { label: "Chargeback", account_name: "Driver Admin Fee & Chargeback Income", testId: "chargeback" },
  { label: "Quick-Pay Discount", account_name: "Short-Pay — Agreed Concession / Quick-Pay Discount", testId: "quick-pay-discount" },
];

type Props = {
  open: boolean;
  bankTransactionId: string | null;
  bankTransactionLabel?: string | null;
  /** ISO date (YYYY-MM-DD) of the bank line — ORDERS §19 Find Other Matches default ±90 d. */
  bankTransactionDate?: string | null;
  operatingCompanyId: string;
  onClose: () => void;
  // HELD banking-categorize wiring: lets a host page (e.g. BankingTransactionsDesignView's row Action
  // menu) refresh its own transaction list once a match is confirmed. Optional — existing callers that
  // don't pass it keep prior behavior (drawer-local refetch only).
  onAccepted?: () => void;
};

const KIND_LABELS: Record<BankMatchCandidateKind, string> = {
  payment: "Payment",
  bill_payment: "Bill Payment",
  transfer: "Transfer",
  je: "Journal Entry",
  bill: "Bill",
  expense: "Expense",
};

/** ORDERS §19 Find Other Matches — Record type chips (QBO Show). */
const RECORD_TYPE_CHIPS: ReadonlyArray<{ kind: BankMatchCandidateKind; label: string }> = [
  { kind: "payment", label: "Payment" },
  { kind: "bill_payment", label: "Bill Payment" },
  { kind: "expense", label: "Expense" },
  { kind: "transfer", label: "Transfer" },
  { kind: "je", label: "Journal Entry" },
  { kind: "bill", label: "Bill" },
];

function chipClassName(selected: boolean) {
  return `h-7 rounded-sm border px-2 text-xs ${
    selected
      ? "border-[#14314F] bg-[#14314F] text-white"
      : "border-[#E5E7EB] bg-white text-[#1F2A44]"
  }`;
}

const KIND_ENTITY: Record<BankMatchCandidateKind, EntityKind> = {
  payment: "payment",
  bill_payment: "bill_payment",
  transfer: "transfer",
  je: "journal_entry",
  bill: "bill",
  expense: "expense",
};

function formatMoneyCents(cents: number | null | undefined) {
  if (cents == null || Number.isNaN(Number(cents))) return "—";
  return formatUsdCents(Math.abs(Number(cents)));
}

function candidateDrillLabel(candidate: BankMatchCandidate) {
  const memo = candidate.memo?.trim();
  return memo || KIND_LABELS[candidate.ledger_entry_kind];
}

/** Label-only chrome — EntityLink must stay inline at the call site (entity-link-adoption). */
function kindBadgeClassName() {
  return "inline-flex items-center rounded-sm border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-700 hover:underline";
}


function formatWindowDay(iso: string) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** ORDERS §19 / QBO Find Other Matches — default date window is bank date ±90 days. */
export function matchWindowPlusMinus90(isoDate: string): { from: string; to: string } | null {
  const day = isoDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const base = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return null;
  const from = new Date(base);
  from.setUTCDate(from.getUTCDate() - 90);
  const to = new Date(base);
  to.setUTCDate(to.getUTCDate() + 90);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function windowHeaderLabel(step: 1 | 2 | "custom" | undefined, from: string, to: string) {
  if (!from || !to) return "Match window";
  const range = `${formatWindowDay(from)} – ${formatWindowDay(to)}`;
  if (step === 1) return `Within 3 days (${range})`;
  if (step === 2) return `Within 7 days (${range})`;
  return `Custom search (${range})`;
}

export function MatchDrawer({
  open,
  bankTransactionId,
  bankTransactionLabel,
  bankTransactionDate,
  operatingCompanyId,
  onClose,
  onAccepted,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  /** undefined = default cascade; 2 = user clicked Search 7 days (only when no bank date ±90d seed). */
  const [windowStep, setWindowStep] = useState<1 | 2 | undefined>(undefined);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [draftQ, setDraftQ] = useState("");
  const [categorizeVendorId, setCategorizeVendorId] = useState("");
  const [categorizeGlAccountId, setCategorizeGlAccountId] = useState("");
  /** ROUND 206 Resolve — write-off / difference CoA for non-zero variance accept. */
  const [writeOffAccountId, setWriteOffAccountId] = useState("");
  /** ORDERS §19 — Suggested chip (auto_match / high-confidence only). */
  const [suggestedOnly, setSuggestedOnly] = useState(false);
  /** ORDERS §19 — Record type chip; null = all types. */
  const [recordKind, setRecordKind] = useState<BankMatchCandidateKind | null>(null);
  const { pushToast } = useToast();

  const seedPlusMinus90 = () => {
    const win90 = bankTransactionDate ? matchWindowPlusMinus90(bankTransactionDate) : null;
    if (win90) {
      setDateFrom(win90.from);
      setDateTo(win90.to);
      setWindowStep(undefined);
      return true;
    }
    setDateFrom("");
    setDateTo("");
    return false;
  };

  useEffect(() => {
    if (!open) return;
    setWindowStep(undefined);
    setSearchQ("");
    setDraftQ("");
    setSelectedId(null);
    setSelectedIds(new Set());
    setWriteOffAccountId("");
    setSuggestedOnly(false);
    setRecordKind(null);
    // B-3 §19 — Find Other Matches default date range is ±90 d from the bank line (not 3/7 cascade).
    if (!seedPlusMinus90()) {
      setDateFrom("");
      setDateTo("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed only on open / bank row change
  }, [open, bankTransactionId, bankTransactionDate]);

  const hasCustomFilters = Boolean(dateFrom || dateTo || searchQ.trim());
  const expectedNinety = bankTransactionDate ? matchWindowPlusMinus90(bankTransactionDate) : null;
  const usingNinetyDayDefault = Boolean(
    expectedNinety && dateFrom === expectedNinety.from && dateTo === expectedNinety.to && !searchQ.trim()
  );

  const candidatesQuery = useQuery({
    queryKey: [
      "banking",
      "match-candidates",
      operatingCompanyId,
      bankTransactionId,
      windowStep ?? "cascade",
      dateFrom,
      dateTo,
      searchQ,
      recordKind ?? "all",
    ],
    queryFn: () =>
      getMatchCandidates(String(bankTransactionId), operatingCompanyId, {
        windowStep: hasCustomFilters ? undefined : windowStep,
        q: searchQ || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        kinds: recordKind ? [recordKind] : undefined,
      }),
    enabled: open && Boolean(operatingCompanyId && bankTransactionId),
  });

  const vendorsQuery = useQuery({
    queryKey: ["banking", "match-drawer", "vendors", operatingCompanyId],
    queryFn: () => listVendors({ operating_company_id: operatingCompanyId }),
    enabled: open && Boolean(operatingCompanyId),
  });
  const coaQuery = useQuery({
    queryKey: ["banking", "match-drawer", "coa", operatingCompanyId],
    queryFn: () => getCoaAccounts(operatingCompanyId),
    enabled: open && Boolean(operatingCompanyId),
  });

  const confirmMutation = useMutation({
    mutationFn: (candidate: BankMatchCandidate) =>
      acceptBankReconMatch({
        operating_company_id: operatingCompanyId,
        bank_transaction_id: String(bankTransactionId),
        ledger_entry_kind: candidate.ledger_entry_kind as "payment" | "bill_payment" | "transfer" | "je" | "expense",
        ledger_entry_id: candidate.ledger_entry_id,
        variance_account_id: candidate.amount_gap_cents !== 0 ? writeOffAccountId || undefined : undefined,
      }),
    onMutate: (candidate) => setConfirmingId(candidate.ledger_entry_id),
    onSuccess: async () => {
      pushToast("Match confirmed — transaction cleared.", "success");
      await candidatesQuery.refetch();
      onAccepted?.();
    },
    onError: (error) => {
      pushToast(userFacingApiError(error, "Confirm match failed"), "error");
    },
    onSettled: () => setConfirmingId(null),
  });

  const multiConfirmMutation = useMutation({
    mutationFn: (entries: BankMatchCandidate[]) =>
      acceptBankReconMultiMatch({
        operating_company_id: operatingCompanyId,
        bank_transaction_id: String(bankTransactionId),
        entries: entries.map((c) => ({
          ledger_entry_kind: c.ledger_entry_kind as "payment" | "bill_payment" | "transfer" | "je" | "expense",
          ledger_entry_id: c.ledger_entry_id,
        })),
      }),
    onSuccess: async () => {
      pushToast("Multi-document match confirmed — bank line cleared.", "success");
      setSelectedIds(new Set());
      await candidatesQuery.refetch();
      onAccepted?.();
    },
    onError: (error) => {
      pushToast(userFacingApiError(error, "Multi-document match failed"), "error");
    },
  });

  const categorizeMutation = useMutation({
    mutationFn: () =>
      categorizeBankTransaction(String(bankTransactionId), operatingCompanyId, {
        category_kind: "expense",
        gl_account_id: categorizeGlAccountId || undefined,
        vendor_id: categorizeVendorId || undefined,
      }),
    onSuccess: () => {
      pushToast("Transaction categorized.", "success");
      setCategorizeVendorId("");
      setCategorizeGlAccountId("");
      onAccepted?.();
      onClose();
    },
    onError: (error) => {
      pushToast(userFacingApiError(error, "Categorize failed"), "error");
    },
  });

  const listState = useListState(candidatesQuery, (candidatesQuery.data?.candidates ?? []).length === 0);

  const candidates: BankMatchCandidate[] = useMemo(() => {
    const raw = candidatesQuery.data?.candidates ?? [];
    // ORDERS §19 Suggested chip — high-confidence / auto_match only (client filter on ranked list).
    if (!suggestedOnly) return raw;
    return raw.filter((c) => c.auto_match === true);
  }, [candidatesQuery.data?.candidates, suggestedOnly]);
  const bankAmountCents = Number(candidatesQuery.data?.bank_amount_cents ?? 0);
  const multiSelected = useMemo(
    () => candidates.filter((c) => selectedIds.has(c.ledger_entry_id) && c.ledger_entry_kind !== "bill"),
    [candidates, selectedIds]
  );
  const multiSumCents = multiSelected.reduce((s, c) => s + Number(c.amount_cents ?? 0), 0);
  const multiExact = multiSelected.length >= 2 && bankAmountCents > 0 && multiSumCents === bankAmountCents;
  // B-3 §19b — QBO arithmetic box: Bank / Selected / Difference (always visible).
  const singleSelected = selectedId
    ? candidates.find((c) => c.ledger_entry_id === selectedId)
    : undefined;
  const selectedAmountCents =
    multiSelected.length >= 1
      ? multiSumCents
      : singleSelected
        ? Number(singleSelected.amount_cents ?? 0)
        : 0;
  const differenceCents = bankAmountCents - selectedAmountCents;

  if (!bankTransactionId) return null;

  const win = candidatesQuery.data?.window;
  const topAutoMatchId = candidates.find((c) => c.auto_match)?.ledger_entry_id ?? null;
  const canCategorize = Boolean(categorizeGlAccountId) && !categorizeMutation.isPending;
  const showSearch7Days =
    !hasCustomFilters && win?.step === 1 && candidates.length > 0 && windowStep !== 2;
  const showWidenBanner = Boolean(win?.auto_widened) && !hasCustomFilters;
  // B-3 §19 — ±90d default always shows From/To; cascade still reveals them when step-2 empties.
  const showFromTo =
    hasCustomFilters ||
    usingNinetyDayDefault ||
    (win?.step === 2 && candidates.length === 0) ||
    (windowStep === 2 && candidates.length === 0);

  const toggleMulti = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSelectedId(id);
  };

  return (
    <ParityDrawer open={open} title="Find other matches" onClose={onClose}>
      <div data-testid="match-drawer" data-b3-find-other-matches="1">
        {bankTransactionId ? (
          <p className="mb-1 text-xs text-slate-600">
            Bank transaction:{" "}
            <EntityLink
              kind="bank_transaction"
              id={candidatesQuery.data?.bank_transaction_id ?? bankTransactionId}
              label={bankTransactionLabel?.trim() || "Bank transaction"}
            />
          </p>
        ) : null}
        {/* B-3 §19b — arithmetic always visible; Match only at Difference $0.00 (exact multi / exact single / write-off). */}
        <div
          className="mb-3 rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] px-2.5 py-2 text-xs text-[#0F1219]"
          data-b3-match-arithmetic="1"
          data-testid="match-drawer-arithmetic"
        >
          <div className="flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
            <span>
              Bank transaction amount:{" "}
              <strong>{formatMoneyCents(bankAmountCents)}</strong>
            </span>
            <span>
              Selected amount: <strong>{formatMoneyCents(selectedAmountCents)}</strong>
            </span>
            <span className={differenceCents === 0 ? "text-[#027A48]" : "text-red-700"}>
              Difference: <strong>{formatMoneyCents(Math.abs(differenceCents))}</strong>
              {differenceCents !== 0 ? " (resolve below or select exact sum)" : ""}
            </span>
          </div>
        </div>
        <p className="mb-1 text-xs font-medium text-[#1F2A44]" data-testid="match-window-header">
          {usingNinetyDayDefault
            ? `±90 days (${formatWindowDay(dateFrom)} – ${formatWindowDay(dateTo)})`
            : hasCustomFilters
              ? "Custom search"
              : windowHeaderLabel(win?.step, win?.from ?? "", win?.to ?? "")}
        </p>
        <p className="mb-3 text-xs text-slate-500">
          Exact-amount matches link and clear with no journal entry. A variance (partial) match requires a
          write-off / difference account below — that posts the balanced variance JE. Select 2+ exact
          documents whose amounts sum to the bank line for one-bank-line → many-documents. Bill
          candidates stay held (CHAIN-04). Live production ledger rows only — never fixtures.
        </p>

        <div className="mb-3 space-y-1" data-testid="match-drawer-writeoff-account">
          <label className="block text-xs text-slate-600">
            Write-off / difference account (required for variance)
            <div className="mt-0.5">
              <ReferenceSelect
                value={writeOffAccountId || null}
                onChange={(aid) => setWriteOffAccountId(aid ?? "")}
                options={(coaQuery.data?.accounts ?? []).map(coaAccountReferenceOption)}
                createKind="category"
                operatingCompanyId={operatingCompanyId}
                placeholder="Select write-off / difference account"
                onOptionCreated={() => void coaQuery.refetch()}
              />
            </div>
          </label>
          <div
            className="flex flex-wrap gap-1"
            data-testid="match-drawer-named-resolve-picks"
            role="group"
            aria-label="Named difference accounts"
          >
            {NAMED_RESOLVE_QUICK_PICKS.map((pick) => {
              const match = (coaQuery.data?.accounts ?? []).find(
                (a) => a.account_name === pick.account_name,
              );
              const selected = Boolean(match && writeOffAccountId === match.id);
              return (
                <button
                  key={pick.testId}
                  type="button"
                  data-testid={`match-named-resolve-${pick.testId}`}
                  disabled={!match}
                  title={
                    match
                      ? pick.account_name
                      : `${pick.label} not on this entity chart of accounts`
                  }
                  className={`h-7 rounded-sm border px-2 text-xs ${
                    selected
                      ? "border-[#14314F] bg-[#14314F] text-white"
                      : "border-[#E5E7EB] bg-white text-[#1F2A44]"
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                  onClick={() => {
                    if (match) setWriteOffAccountId(match.id);
                  }}
                >
                  {pick.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-slate-500">
            Named only: Reserve Deposit · Factoring Fees · Wire Fee · Chargeback · Quick-Pay Discount.
            Never a generic adjustment.
          </p>
        </div>

        {multiSelected.length >= 2 ? (
          <div
            className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5"
            data-testid="match-drawer-multi-bar"
          >
            <p className="text-xs text-slate-700">
              {multiSelected.length} selected · sum {formatMoneyCents(multiSumCents)}
              {bankAmountCents > 0 ? ` / bank ${formatMoneyCents(bankAmountCents)}` : ""}
              {multiExact ? " · exact" : " · not exact yet"}
            </p>
            <button
              type="button"
              data-testid="match-multi-confirm"
              className={
                multiExact
                  ? "rounded-sm border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-white hover:bg-slate-800 disabled:opacity-60"
                  : "rounded-sm border border-slate-300 bg-white px-2 py-1 text-xs text-slate-400"
              }
              disabled={!multiExact || multiConfirmMutation.isPending}
              onClick={() => multiExact && multiConfirmMutation.mutate(multiSelected)}
            >
              {multiConfirmMutation.isPending ? "Confirming…" : "Confirm multi-document match"}
            </button>
          </div>
        ) : null}

        {showWidenBanner ? (
          <p
            className="mb-2 rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] px-2 py-1.5 text-xs text-[#1F2A44]"
            data-testid="match-window-widened-banner"
          >
            No candidates within 3 days — widened to 7 days.
          </p>
        ) : null}

        {/* B-3 §19 — chips Suggested / by Record type (QBO Find Other Matches). */}
        <div
          className="mb-3 flex flex-wrap items-center gap-1"
          data-testid="match-drawer-filter-chips"
          data-b3-suggested-record-type-chips="1"
          role="group"
          aria-label="Suggested and record type filters"
        >
          <button
            type="button"
            data-testid="match-chip-suggested"
            aria-pressed={suggestedOnly}
            className={chipClassName(suggestedOnly)}
            onClick={() => setSuggestedOnly((v) => !v)}
          >
            Suggested
          </button>
          <button
            type="button"
            data-testid="match-chip-record-all"
            aria-pressed={recordKind === null}
            className={chipClassName(recordKind === null)}
            onClick={() => setRecordKind(null)}
          >
            All types
          </button>
          {RECORD_TYPE_CHIPS.map((chip) => {
            const selected = recordKind === chip.kind;
            return (
              <button
                key={chip.kind}
                type="button"
                data-testid={`match-chip-record-${chip.kind}`}
                aria-pressed={selected}
                className={chipClassName(selected)}
                onClick={() => setRecordKind(selected ? null : chip.kind)}
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2" data-testid="match-window-controls">
          <input
            type="search"
            value={draftQ}
            onChange={(e) => setDraftQ(e.target.value)}
            placeholder="Search payee, memo, ref…"
            className="min-h-11 min-w-[160px] flex-1 rounded-sm border border-slate-300 px-2 text-xs"
            data-testid="match-search-query"
            onKeyDown={(e) => {
              if (e.key === "Enter") setSearchQ(draftQ.trim());
            }}
          />
          <button
            type="button"
            data-testid="match-search-apply"
            className="rounded-sm border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700"
            onClick={() => setSearchQ(draftQ.trim())}
          >
            Search
          </button>
          {showSearch7Days ? (
            <button
              type="button"
              data-testid="match-search-7-days"
              className="rounded-sm border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700"
              onClick={() => setWindowStep(2)}
            >
              Search 7 days
            </button>
          ) : null}
          {hasCustomFilters || windowStep === 2 ? (
            <button
              type="button"
              className="rounded-sm border border-slate-300 px-2 py-1.5 text-xs text-slate-600"
              data-testid="match-window-reset"
              onClick={() => {
                setWindowStep(undefined);
                setSearchQ("");
                setDraftQ("");
                setSuggestedOnly(false);
                setRecordKind(null);
                if (!seedPlusMinus90()) {
                  setDateFrom("");
                  setDateTo("");
                }
              }}
            >
              {bankTransactionDate ? "Reset to ±90 days" : "Reset to 3 days"}
            </button>
          ) : null}
        </div>

        {showFromTo ? (
          <div className="mb-3 flex flex-wrap items-end gap-2" data-testid="match-from-to">
            <label className="text-xs text-slate-600">
              From
              <DatePicker data-testid="match-date-from" value={dateFrom} onChange={setDateFrom} className="mt-0.5 h-7" />
            </label>
            <label className="text-xs text-slate-600">
              To
              <DatePicker data-testid="match-date-to" value={dateTo} onChange={setDateTo} className="mt-0.5 h-7" />
            </label>
          </div>
        ) : null}

        {candidatesQuery.isError ? <ListErrorBanner onRetry={() => void candidatesQuery.refetch()} /> : null}
        {candidatesQuery.isLoading ? <p className="text-xs text-slate-600">Loading candidates…</p> : null}

        <div className="space-y-2" data-testid="match-candidate-list">
          {candidates.map((c) => {
            const isTopAuto = c.ledger_entry_id === topAutoMatchId;
            const isSelected = c.ledger_entry_id === selectedId;
            const isMultiChecked = selectedIds.has(c.ledger_entry_id);
            const isBill = c.ledger_entry_kind === "bill";
            const isExactMatch = c.amount_gap_cents === 0;
            const canConfirmVariance = !isBill && !isExactMatch && Boolean(writeOffAccountId);
            const canConfirm = !isBill && (isExactMatch || canConfirmVariance);
            const isConfirming = confirmMutation.isPending && confirmingId === c.ledger_entry_id;
            return (
              // FAIL-BM1 — the row's PRIMARY click must SELECT the candidate, not drill through. Before
              // this, the only way to select was the small radio, while the most prominent clickable thing
              // in the row was the EntityLink — so the natural click navigated away from the match the user
              // was trying to make, losing the drawer. Drill-through is now strictly secondary: it still
              // works, but only when the link itself is clicked (see stopPropagation below).
              <div
                key={`${c.ledger_entry_kind}:${c.ledger_entry_id}`}
                data-testid="match-candidate-row"
                onClick={() => setSelectedId(c.ledger_entry_id)}
                className={`cursor-pointer rounded border px-3 py-2 ${
                  isTopAuto ? "border-slate-400 bg-slate-50" : "border-slate-200 bg-white"
                } ${isSelected ? "ring-1 ring-slate-400" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <input
                      type="checkbox"
                      data-testid="match-candidate-multi-select"
                      className="accent-slate-700"
                      checked={isMultiChecked}
                      disabled={isBill}
                      title={isBill ? "Bills stay held (CHAIN-04)" : "Include in multi-document match"}
                      onChange={() => toggleMulti(c.ledger_entry_id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <input
                      type="radio"
                      name="match-candidate"
                      data-testid="match-candidate-select"
                      className="accent-slate-700"
                      checked={isSelected}
                      onChange={() => setSelectedId(c.ledger_entry_id)}
                    />
                    {c.ledger_entry_id ? (
                      // Drill-through stays available but must not also fire the row's select — otherwise
                      // navigating would silently change the selection on the way out.
                      <span onClick={(event) => event.stopPropagation()} data-testid="match-candidate-drillthrough">
                        <EntityLink
                          kind={KIND_ENTITY[c.ledger_entry_kind]}
                          id={c.ledger_entry_id}
                          label={candidateDrillLabel(c)}
                          data-testid="match-candidate-kind"
                          className={kindBadgeClassName()}
                        />
                      </span>
                    ) : null}
                    {isTopAuto ? (
                      <span
                        data-testid="match-candidate-top"
                        className="inline-flex items-center rounded-sm bg-slate-800 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white"
                      >
                        Best match
                      </span>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-slate-900" data-testid="match-candidate-amount">
                    {formatMoneyCents(c.amount_cents)}
                  </span>
                </div>

                <div className="mt-1 truncate text-[11px] text-slate-700" title={c.memo}>
                  {c.memo?.trim() ? c.memo : "—"}
                </div>

                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
                  <span data-testid="match-candidate-date">Date: {String(c.event_date ?? "").slice(0, 10) || "—"}</span>
                  <span>Amount gap: {formatMoneyCents(c.amount_gap_cents)}</span>
                  <span>Date gap: {c.date_gap_days}d</span>
                  <span>Score: {c.match_score.toFixed(3)}</span>
                </div>

                <div className="mt-2 flex items-center justify-end gap-2">
                  {isBill ? (
                    <span className="text-xs text-slate-400">Posting available after CHAIN-04</span>
                  ) : !isExactMatch && !writeOffAccountId ? (
                    <span className="text-xs text-slate-400" data-testid="match-candidate-variance-held">
                      {VARIANCE_NEEDS_WRITEOFF}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    data-testid="match-candidate-confirm"
                    className={
                      canConfirm
                        ? "rounded-sm border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-white hover:bg-slate-800 disabled:opacity-60"
                        : "rounded-sm border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-400"
                    }
                    disabled={!canConfirm || isConfirming}
                    title={
                      isBill
                        ? "Recording the bill payment is CHAIN-04 (Part 2b)"
                        : !isExactMatch && !writeOffAccountId
                        ? VARIANCE_NEEDS_WRITEOFF
                        : isExactMatch
                        ? "Confirm this match — links and clears the transaction, no journal entry posted"
                        : "Confirm with write-off / difference account — posts balanced variance JE"
                    }
                    onClick={canConfirm ? () => confirmMutation.mutate(c) : undefined}
                  >
                    {isConfirming ? "Confirming…" : isExactMatch ? "Confirm match" : "Resolve difference"}
                  </button>
                </div>
              </div>
            );
          })}
          {listState.isEmpty ? (
            <p className="text-xs text-slate-600" data-testid="match-candidate-empty">
              {showFromTo
                ? "No matchable records in this window. Set From / To to search a custom range."
                : "No matchable records found for this transaction."}
            </p>
          ) : null}
        </div>

        {/* §4 nested +Create — vendor + CoA category when no ledger match fits (QBO Find match → Categorize). */}
        <div
          className="mt-4 space-y-2 border-t border-slate-200 pt-3"
          data-testid="match-drawer-categorize-create"
        >
          <p className="text-xs font-semibold text-slate-800">Or categorize instead</p>
          <p className="text-[11px] text-slate-500">
            Nested <strong>+ Add new</strong> creates stay in this drawer (entity-scoped catalogs). Category is
            required; vendor is optional. Uses the same categorize API as the Transactions register.
          </p>
          <label className="block text-xs text-slate-600">
            Payee (vendor)
            <div className="mt-0.5" data-testid="match-drawer-picker-vendor">
              <ReferenceSelect
                value={categorizeVendorId || null}
                onChange={(vid) => setCategorizeVendorId(vid ?? "")}
                options={(vendorsQuery.data?.vendors ?? []).map(vendorReferenceOption)}
                createKind="vendor"
                operatingCompanyId={operatingCompanyId}
                placeholder="Select payee (vendor)"
                onOptionCreated={() => void vendorsQuery.refetch()}
              />
            </div>
          </label>
          <label className="block text-xs text-slate-600">
            Category (Chart of Accounts)
            <div className="mt-0.5" data-testid="match-drawer-picker-category">
              <ReferenceSelect
                value={categorizeGlAccountId || null}
                onChange={(aid) => setCategorizeGlAccountId(aid ?? "")}
                options={(coaQuery.data?.accounts ?? []).map((account) => ({
                  value: account.id,
                  label: account.account_name,
                  type: account.account_type ? String(account.account_type) : undefined,
                }))}
                createKind="category"
                operatingCompanyId={operatingCompanyId}
                placeholder="Select category account"
                onOptionCreated={() => void coaQuery.refetch()}
              />
            </div>
          </label>
          <button
            type="button"
            data-testid="match-drawer-categorize-submit"
            className="rounded-sm border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] text-white hover:bg-slate-800 disabled:opacity-60"
            disabled={!canCategorize}
            onClick={() => categorizeMutation.mutate()}
          >
            {categorizeMutation.isPending ? "Categorizing…" : "Categorize"}
          </button>
        </div>
      </div>
    </ParityDrawer>
  );
}
