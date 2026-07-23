import { useState } from "react";
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
import { ReferenceSelect } from "../../../components/parity/ReferenceSelect";
import { vendorReferenceOption } from "../../../components/parity/referenceOptionLabels";
import { useToast } from "../../../components/Toast";
import { useListState } from "../../../components/list-state";
import { formatUsdCents } from "../../../lib/money";

// BANKREC-CONFIRM-01 (Tier 2): Confirm is enabled ONLY for an exact-amount match (amount_gap_cents
// === 0) on a persistable non-bill kind. gap=0 = pure link-and-clear (review_state='matched' +
// matched_<kind>_id) — NO journal entry is posted. "bill" always stays held (CHAIN-04 / Part 2b
// records the bill payment). Any variance (gap !== 0) stays held pending the balanced-JE proof.
const VARIANCE_HELD_NOTE = "Variance posting pending balanced-JE proof (Tier-1)";

type Props = {
  open: boolean;
  bankTransactionId: string | null;
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

/** Label-only chrome — EntityLink must stay inline at the call site (entity-link-adoption). */
function kindBadgeClassName() {
  return "inline-flex items-center rounded-sm border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700 hover:underline";
}

export function MatchDrawer({ open, bankTransactionId, operatingCompanyId, onClose, onAccepted }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [searchAll, setSearchAll] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [draftQ, setDraftQ] = useState("");
  const [categorizeVendorId, setCategorizeVendorId] = useState("");
  const [categorizeGlAccountId, setCategorizeGlAccountId] = useState("");
  const { pushToast } = useToast();

  const candidatesQuery = useQuery({
    queryKey: ["banking", "match-candidates", operatingCompanyId, bankTransactionId, searchAll, searchQ],
    queryFn: () =>
      getMatchCandidates(String(bankTransactionId), operatingCompanyId, {
        searchAll,
        q: searchQ || undefined,
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
      pushToast(String((error as Error).message ?? "Confirm match failed"), "error");
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
      pushToast(String((error as Error).message ?? "Categorize failed"), "error");
    },
  });

  // Empty message renders only once the candidates query settles, never mid-fetch.
  const listState = useListState(candidatesQuery, (candidatesQuery.data?.candidates ?? []).length === 0);

  if (!open || !bankTransactionId) return null;

  const candidates: BankMatchCandidate[] = candidatesQuery.data?.candidates ?? [];
  const topAutoMatchId = candidates.find((c) => c.auto_match)?.ledger_entry_id ?? null;
  const canCategorize = Boolean(categorizeGlAccountId) && !categorizeMutation.isPending;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} data-testid="match-drawer-scrim" />
      <aside
        data-testid="match-drawer"
        className="fixed right-0 top-0 z-50 h-full w-[480px] overflow-y-auto border-l border-slate-200 bg-white p-4"
      >
        <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2">
          <h2 className="text-sm font-semibold text-slate-900">Match transaction</h2>
          <button
            type="button"
            data-testid="match-drawer-close"
            className="rounded-sm border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <p className="mb-3 text-[11px] text-slate-500">
          Recommended matches (±7 days). If none fit, use <strong>Search all</strong> like QuickBooks to widen the
          window and search by payee / memo / ref. Exact-amount matches can be confirmed to link and clear — no
          journal entry is posted. Bill payments and any amount variance stay held. Candidates are live production
          ledger rows — never fixtures.
        </p>

        <div className="mb-3 flex flex-wrap items-center gap-2" data-testid="match-search-all-controls">
          <input
            type="search"
            value={draftQ}
            onChange={(e) => setDraftQ(e.target.value)}
            placeholder="Search payee, memo, ref…"
            className="min-h-11 min-w-[160px] flex-1 rounded-sm border border-slate-300 px-2 text-xs"
            data-testid="match-search-query"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setSearchQ(draftQ.trim());
                setSearchAll(true);
              }
            }}
          />
          <button
            type="button"
            data-testid="match-search-all"
            className={`rounded-sm border px-2 py-1.5 text-[11px] ${
              searchAll ? "border-slate-800 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"
            }`}
            onClick={() => {
              setSearchQ(draftQ.trim());
              setSearchAll(true);
            }}
          >
            Search all
          </button>
          {searchAll ? (
            <button
              type="button"
              className="rounded-sm border border-slate-300 px-2 py-1.5 text-[11px] text-slate-600"
              onClick={() => {
                setSearchAll(false);
                setSearchQ("");
                setDraftQ("");
              }}
            >
              Reset to recommended
            </button>
          ) : null}
        </div>

        {candidatesQuery.isError ? <ListErrorBanner onRetry={() => void candidatesQuery.refetch()} /> : null}
        {candidatesQuery.isLoading ? <p className="text-sm text-slate-600">Loading candidates…</p> : null}

        <div className="space-y-2" data-testid="match-candidate-list">
          {candidates.map((c) => {
            const isTopAuto = c.ledger_entry_id === topAutoMatchId;
            const isSelected = c.ledger_entry_id === selectedId;
            const isBill = c.ledger_entry_kind === "bill";
            const isExactMatch = c.amount_gap_cents === 0;
            const canConfirm = !isBill && isExactMatch;
            const isConfirming = confirmMutation.isPending && confirmingId === c.ledger_entry_id;
            return (
              <div
                key={`${c.ledger_entry_kind}:${c.ledger_entry_id}`}
                data-testid="match-candidate-row"
                className={`rounded border px-3 py-2 ${
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
                      <EntityLink
                        kind={KIND_ENTITY[c.ledger_entry_kind]}
                        id={c.ledger_entry_id}
                        label={KIND_LABELS[c.ledger_entry_kind]}
                        data-testid="match-candidate-kind"
                        className={kindBadgeClassName()}
                      />
                    ) : null}
                    {isTopAuto ? (
                      <span
                        data-testid="match-candidate-top"
                        className="inline-flex items-center rounded-sm bg-slate-800 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white"
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

                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-500">
                  <span data-testid="match-candidate-date">Date: {String(c.event_date ?? "").slice(0, 10) || "—"}</span>
                  <span>Amount gap: {formatMoneyCents(c.amount_gap_cents)}</span>
                  <span>Date gap: {c.date_gap_days}d</span>
                  <span>Score: {c.match_score.toFixed(3)}</span>
                </div>

                <div className="mt-2 flex items-center justify-end gap-2">
                  {isBill ? (
                    <span className="text-[10px] text-slate-400">Posting available after CHAIN-04</span>
                  ) : !isExactMatch ? (
                    <span className="text-[10px] text-slate-400" data-testid="match-candidate-variance-held">
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
            <p className="text-sm text-slate-600" data-testid="match-candidate-empty">
              No matchable records found in the ±7-day window for this transaction.
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
      </aside>
    </>
  );
}
