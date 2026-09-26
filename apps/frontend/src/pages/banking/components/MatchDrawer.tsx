import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  acceptBankReconMatch,
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
import { vendorReferenceOption } from "../../../components/parity/referenceOptionLabels";
import { DatePicker } from "../../../components/forms/DatePicker";
import { useToast } from "../../../components/Toast";
import { useListState } from "../../../components/list-state";
import { formatUsdCents } from "../../../lib/money";
import { userFacingApiError } from "../../../lib/api-error-message";

// BANKREC-CONFIRM-01 (Tier 2): Confirm is enabled ONLY for an exact-amount match (amount_gap_cents
// === 0) on a persistable non-bill kind. gap=0 = pure link-and-clear (review_state='matched' +
// matched_<kind>_id) — NO journal entry is posted. "bill" always stays held (CHAIN-04 / Part 2b
// records the bill payment). Any variance (gap !== 0) stays held.
//
// BANK-F9998 F8 (2026-09-03) — the balanced-JE proof this note asks for now exists:
// scripts/verify-bank-recon-variance-je-always-balanced.mjs proves, structurally, that
// match.service.ts's postDifferenceJournalEntry can never post an unbalanced variance JE (its two
// posting legs always share one magnitude on opposite sides, for any variance amount). That is
// the PROOF, not an authorization to post — whether/when a variance match becomes live-confirmable
// here is still a separate, owner-reserved Tier-1 decision (this codebase's own HOLD-FOR-JORGE
// convention for money-posting UI), so canConfirm below is deliberately unchanged.
const VARIANCE_HELD_NOTE = "Variance posting proven balanced (Tier-1) — awaiting owner go-ahead to enable Confirm";

type Props = {
  open: boolean;
  bankTransactionId: string | null;
  bankTransactionLabel?: string | null;
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

function windowHeaderLabel(step: 1 | 2 | "custom" | undefined, from: string, to: string) {
  if (!from || !to) return "Match window";
  const range = `${formatWindowDay(from)} – ${formatWindowDay(to)}`;
  if (step === 1) return `Within 3 days (${range})`;
  if (step === 2) return `Within 7 days (${range})`;
  return `Custom search (${range})`;
}

export function MatchDrawer({ open, bankTransactionId, bankTransactionLabel, operatingCompanyId, onClose, onAccepted }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  /** undefined = default cascade; 2 = user clicked Search 7 days */
  const [windowStep, setWindowStep] = useState<1 | 2 | undefined>(undefined);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [draftQ, setDraftQ] = useState("");
  const [categorizeVendorId, setCategorizeVendorId] = useState("");
  const [categorizeGlAccountId, setCategorizeGlAccountId] = useState("");
  const { pushToast } = useToast();

  useEffect(() => {
    if (!open) return;
    setWindowStep(undefined);
    setDateFrom("");
    setDateTo("");
    setSearchQ("");
    setDraftQ("");
    setSelectedId(null);
  }, [open, bankTransactionId]);

  const hasCustomFilters = Boolean(dateFrom || dateTo || searchQ.trim());

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
    ],
    queryFn: () =>
      getMatchCandidates(String(bankTransactionId), operatingCompanyId, {
        windowStep: hasCustomFilters ? undefined : windowStep,
        q: searchQ || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
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

  if (!bankTransactionId) return null;

  const candidates: BankMatchCandidate[] = candidatesQuery.data?.candidates ?? [];
  const win = candidatesQuery.data?.window;
  const topAutoMatchId = candidates.find((c) => c.auto_match)?.ledger_entry_id ?? null;
  const canCategorize = Boolean(categorizeGlAccountId) && !categorizeMutation.isPending;
  const showSearch7Days =
    !hasCustomFilters && win?.step === 1 && candidates.length > 0 && windowStep !== 2;
  const showWidenBanner = Boolean(win?.auto_widened) && !hasCustomFilters;
  const showFromTo =
    hasCustomFilters ||
    (win?.step === 2 && candidates.length === 0) ||
    (windowStep === 2 && candidates.length === 0);

  return (
    <ParityDrawer open={open} title="Match transaction" onClose={onClose}>
      <div data-testid="match-drawer">
        {bankTransactionId ? (
          <p className="mb-1 text-[11px] text-slate-600">
            Bank transaction:{" "}
            <EntityLink
              kind="bank_transaction"
              id={candidatesQuery.data?.bank_transaction_id ?? bankTransactionId}
              label={bankTransactionLabel?.trim() || "Bank transaction"}
            />
          </p>
        ) : null}
        <p className="mb-1 text-xs font-medium text-[#1F2A44]" data-testid="match-window-header">
          {hasCustomFilters
            ? "Custom search"
            : windowHeaderLabel(win?.step, win?.from ?? "", win?.to ?? "")}
        </p>
        <p className="mb-3 text-[11px] text-slate-500">
          Exact-amount matches can be confirmed to link and clear — no journal entry is posted. Bill
          payments and any amount variance stay held. Candidates are live production ledger rows —
          never fixtures.
        </p>

        {showWidenBanner ? (
          <p
            className="mb-2 rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] px-2 py-1.5 text-xs text-[#1F2A44]"
            data-testid="match-window-widened-banner"
          >
            No candidates within 3 days — widened to 7 days.
          </p>
        ) : null}

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
                setDateFrom("");
                setDateTo("");
                setSearchQ("");
                setDraftQ("");
              }}
            >
              Reset to 3 days
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
            const isBill = c.ledger_entry_kind === "bill";
            const isExactMatch = c.amount_gap_cents === 0;
            const canConfirm = !isBill && isExactMatch;
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
                  ) : !isExactMatch ? (
                    <span className="text-xs text-slate-400" data-testid="match-candidate-variance-held">
                      {VARIANCE_HELD_NOTE}
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
                        : !isExactMatch
                        ? VARIANCE_HELD_NOTE
                        : "Confirm this match — links and clears the transaction, no journal entry posted"
                    }
                    onClick={canConfirm ? () => confirmMutation.mutate(c) : undefined}
                  >
                    {isConfirming ? "Confirming…" : "Confirm match"}
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
