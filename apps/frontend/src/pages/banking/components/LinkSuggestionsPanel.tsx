import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  acceptLinkSuggestion,
  bulkAcceptLinkSuggestions,
  excludeLinkSuggestionTransaction,
  getLinkSuggestions,
  undoLinkSuggestionDecision,
} from "../../../api/banking";
import { EntityLink } from "../../../components/shared/EntityLink";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { MONEY_TONE_COLORS, MONEY_DESTRUCTIVE_CLASS, type MoneyTone } from "../../../design/money-design-system";
import { formatUsdCents } from "../../../lib/money";
import { formatDateUS } from "../../../lib/formatDate";

// LOAD-TO-CASH CHAIN, LINK 4 — PR 2: THE HUMAN DECISION. Owner law B, verbatim (2026-09-12): "it
// should never automatch, it suggests and we accept it or change the transactions." Every write
// below is triggered by one explicit click — there is no auto-confirm, no batch-on-load, no timer.
// Undo returns the row to its prior queue by simply reversing the write and refetching.
//
// The Lead's full spec names six verbs exactly: Add / Match / Find match / Exclude / Split / Undo.
// This PR ships Match / Exclude / Undo — the core that a suggested candidate can actually be
// confirmed, a transaction can be taken out of the queue, and either can be reversed. Deferred to
// an honest, disclosed follow-up rather than guessed at here: Add (categorize with no obligation
// match — that write path belongs with PR 3's rules engine, which defines money-in/out + account
// scope), Find match (a manual picker for a candidate this scorer didn't rank), Split (integration
// with the existing split-transaction flow). A backend POST /reject already exists so a future Find
// match can mark the suggestion it replaces as rejected (banking.reconciliation_matches,
// match_state='rejected') without a second guess resurfacing it — not exposed as its own button
// here because "reject a single candidate" isn't one of the six named verbs.
//
// ROUND 276 — bulk accept. Owner: "match in a single batch all those expenses that you could
// match, and I would match the rest myself" / "YES, JUST LIKE QUICKBOOKS DOES." A checkbox per row
// (only rows with a candidate — nothing ambiguous is ever pre-ticked, and a 0-candidate row has
// nothing to tick) + select-all, and one "Accept N" click that is the human acceptance Law B
// requires, exercised in bulk over the SAME /accept handler per row (see
// link-suggestions-actions.routes.ts's acceptLinkSuggestionForUser — no side door). A ticked row
// accepts its own top-ranked candidate (candidates[0], the same one the per-row Match button's
// primary action targets).
//
// ROUND 276 follow-up, owner rule verbatim: "only 100% identical matches (amount, date, payee) may
// be pre-ticked. Anything less comes up unticked for him." A row's top candidate carries its own
// backend-computed `exact_match` boolean (link-suggestion-engine.ts's strict amountGap===0 &&
// days===0 && vendorScore===1 check — never a frontend re-derivation of "identical"). Each newly
// seen row is seeded ONCE, the moment its data first arrives: pre-ticked if exact_match, left
// unticked otherwise. After that first seed, the row is never re-touched by this effect again — a
// refetch after Accept/Undo does not fight a human's own manual tick/untick of a row already on
// screen, and a row that disappears (accepted/excluded) and is never coming back leaves the seeded
// set alone (nothing to reconcile).
const CANDIDATE_KIND_LABEL: Record<string, string> = {
  expense: "Expense",
  bill: "Bill",
  ar_invoice: "Invoice",
  settlement: "Settlement",
  load: "Load",
};

const CANDIDATE_ENTITY_LINK_KIND: Record<string, "expense" | "bill" | "invoice" | "settlement" | "load"> = {
  expense: "expense",
  bill: "bill",
  ar_invoice: "invoice",
  settlement: "settlement",
  load: "load",
};

// THRESHOLD (A1): confidence maps 1:1 to the tone the backend already assigned
// (link-suggestion-engine.ts) — high -> good, medium -> warn, low -> neutral (a low-confidence
// guess is not a failure state, it is still routine information the operator may find useful).
const CONFIDENCE_TONE: Record<"high" | "medium" | "low", MoneyTone> = { high: "good", medium: "warn", low: "neutral" };

function ConfidenceChip({ confidence }: { confidence: "high" | "medium" | "low" }) {
  const tone = CONFIDENCE_TONE[confidence];
  const { text, bg } = MONEY_TONE_COLORS[tone];
  return (
    <span
      className="rounded-sm px-1.5 py-0.5 font-extrabold uppercase tracking-[.05em]"
      style={{ color: text, background: bg, fontSize: "9.5px" }}
    >
      {confidence}
    </span>
  );
}

type LastAction = {
  bankTransactionId: string;
  kind: "accepted" | "excluded";
  summary: string;
};

export function LinkSuggestionsPanel({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["banking", "link-suggestions", companyId],
    queryFn: () => getLinkSuggestions(companyId),
    enabled: Boolean(companyId),
  });

  const [excludingId, setExcludingId] = useState<string | null>(null);
  const [excludeReason, setExcludeReason] = useState("");
  const [lastAction, setLastAction] = useState<LastAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkResultSummary, setBulkResultSummary] = useState<string | null>(null);
  // ROUND 276: rows this effect has already applied its one-time default-pre-tick decision to —
  // never re-seeded, so it can never override a human's own later tick/untick of the same row.
  const seededRowsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const rows = query.data?.transactions;
    if (!rows) return;
    const newlySeen = rows.filter((r) => !seededRowsRef.current.has(r.bank_transaction_id));
    if (newlySeen.length === 0) return;
    const toPreTick = newlySeen.filter((r) => r.candidates[0]?.exact_match === true);
    for (const r of newlySeen) seededRowsRef.current.add(r.bank_transaction_id);
    if (toPreTick.length === 0) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const r of toPreTick) next.add(r.bank_transaction_id);
      return next;
    });
  }, [query.data]);

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: ["banking", "link-suggestions", companyId] });
  }

  const acceptMutation = useMutation({
    mutationFn: (vars: { bankTransactionId: string; obligationType: string; obligationId: string }) =>
      acceptLinkSuggestion(companyId, vars.bankTransactionId, vars.obligationType, vars.obligationId),
    onSuccess: (_data, vars) => {
      setActionError(null);
      setLastAction({ bankTransactionId: vars.bankTransactionId, kind: "accepted", summary: CANDIDATE_KIND_LABEL[vars.obligationType] ?? vars.obligationType });
      void invalidate();
    },
    onError: () => setActionError("Could not accept — the transaction may already be matched. Refresh and try again."),
  });

  const excludeMutation = useMutation({
    mutationFn: (vars: { bankTransactionId: string; reason: string }) =>
      excludeLinkSuggestionTransaction(companyId, vars.bankTransactionId, vars.reason),
    onSuccess: (_data, vars) => {
      setActionError(null);
      setLastAction({ bankTransactionId: vars.bankTransactionId, kind: "excluded", summary: vars.reason });
      setExcludingId(null);
      setExcludeReason("");
      void invalidate();
    },
    onError: () => setActionError("Could not exclude that transaction. Refresh and try again."),
  });

  const undoMutation = useMutation({
    mutationFn: (bankTransactionId: string) => undoLinkSuggestionDecision(companyId, bankTransactionId),
    onSuccess: () => {
      setActionError(null);
      setLastAction(null);
      void invalidate();
    },
    onError: () => setActionError("Could not undo — refresh and try again."),
  });

  const bulkAcceptMutation = useMutation({
    mutationFn: (items: Array<{ bankTransactionId: string; obligationType: string; obligationId: string }>) =>
      bulkAcceptLinkSuggestions(companyId, items),
    onSuccess: (data) => {
      const okCount = data.results.filter((r) => r.ok).length;
      const failCount = data.results.length - okCount;
      setActionError(null);
      setBulkResultSummary(
        failCount === 0
          ? `Accepted ${okCount} of ${data.results.length}.`
          : `Accepted ${okCount} of ${data.results.length} — ${failCount} could not be accepted (already matched or removed). Refresh to see the rest.`
      );
      setSelectedIds(new Set());
      void invalidate();
    },
    onError: () => setActionError("Bulk accept failed. Refresh and try again."),
  });

  if (query.isError) return <ListErrorBanner onRetry={() => void query.refetch()} />;
  if (query.isPending) return <p className="p-3 text-xs text-gray-600">Loading suggestions…</p>;

  const rows = query.data.transactions;
  const withCandidates = rows.filter((r) => r.candidates.length > 0).length;
  const anyMutationPending = acceptMutation.isPending || excludeMutation.isPending || undoMutation.isPending || bulkAcceptMutation.isPending;
  const selectableRows = rows.filter((r) => r.candidates.length > 0);
  const allSelected = selectableRows.length > 0 && selectableRows.every((r) => selectedIds.has(r.bank_transaction_id));
  const exactMatchCount = selectableRows.filter((r) => r.candidates[0]?.exact_match === true).length;

  function toggleRow(bankTransactionId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(bankTransactionId)) next.delete(bankTransactionId);
      else next.add(bankTransactionId);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds(allSelected ? new Set() : new Set(selectableRows.map((r) => r.bank_transaction_id)));
  }

  function runBulkAccept() {
    const items = selectableRows
      .filter((r) => selectedIds.has(r.bank_transaction_id))
      .map((r) => ({
        bankTransactionId: r.bank_transaction_id,
        obligationType: r.candidates[0]!.obligation_type,
        obligationId: r.candidates[0]!.obligation_id,
      }));
    if (items.length === 0) return;
    setBulkResultSummary(null);
    bulkAcceptMutation.mutate(items);
  }

  return (
    <div className="space-y-3" data-testid="banking-link-suggestions-panel">
      <div
        className="rounded-[9px] border border-[#C7D2DC] bg-white px-3 py-2 text-xs text-[#5d6b7a]"
        data-testid="banking-link-suggestions-summary"
      >
        <p className="font-semibold text-[#14314F]">
          {rows.length} unlinked transaction(s) · {withCandidates} have at least one candidate · candidate pool{" "}
          {query.data.candidate_pool_size}
        </p>
        <p className="mt-1">
          Nothing here is written until a human matches or excludes a transaction — this screen never automatches.
        </p>
      </div>

      {lastAction && (
        <div
          className="flex items-center justify-between rounded-[9px] border border-[#C7D2DC] bg-[#F4F8FF] px-3 py-2 text-xs text-[#14314F]"
          data-testid="link-suggestion-last-action"
        >
          <span>
            {lastAction.kind === "accepted" ? `Matched as ${lastAction.summary}.` : `Excluded: "${lastAction.summary}".`}
          </span>
          <button
            type="button"
            className="font-semibold underline underline-offset-2"
            disabled={undoMutation.isPending}
            onClick={() => undoMutation.mutate(lastAction.bankTransactionId)}
            data-testid="link-suggestion-undo"
          >
            {undoMutation.isPending ? "Undoing…" : "Undo"}
          </button>
        </div>
      )}

      {actionError && (
        <div className="rounded-[9px] border border-[#F5C2C0] bg-[#FDEEEE] px-3 py-2 text-xs text-[#8A2E2A]">{actionError}</div>
      )}

      {bulkResultSummary && (
        <div
          className="rounded-[9px] border border-[#C7D2DC] bg-[#F4F8FF] px-3 py-2 text-xs text-[#14314F]"
          data-testid="link-suggestion-bulk-result"
        >
          {bulkResultSummary}
        </div>
      )}

      {selectableRows.length > 0 && (
        <div
          className="flex items-center gap-3 rounded-[9px] border border-[#C7D2DC] bg-white px-3 py-2 text-xs"
          data-testid="link-suggestion-bulk-bar"
        >
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              data-testid="link-suggestion-select-all"
            />
            Select all with a candidate ({selectableRows.length})
          </label>
          <span className="text-gray-500" data-testid="link-suggestion-exact-match-count">
            {exactMatchCount} pre-ticked as exact (amount, date, payee)
          </span>
          <button
            type="button"
            className="ml-auto rounded-sm bg-[#1F6FEB] px-2.5 py-1 font-semibold text-white disabled:opacity-50"
            disabled={selectedIds.size === 0 || anyMutationPending}
            onClick={runBulkAccept}
            data-testid="link-suggestion-bulk-accept"
          >
            {bulkAcceptMutation.isPending ? "Accepting…" : `Accept ${selectedIds.size}`}
          </button>
        </div>
      )}

      <div className="max-h-[70vh] overflow-y-auto rounded-[9px] border border-[#C7D2DC] bg-white">
        {rows.length === 0 ? (
          <p className="p-3 text-xs text-gray-600">Every transaction is linked, excluded, or has no candidate to decide on.</p>
        ) : (
          rows.map((row) => (
            <div
              key={row.bank_transaction_id}
              className="border-b border-gray-100 px-3 py-2 text-xs last:border-b-0"
              data-testid={`link-suggestion-row-${row.bank_transaction_id}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                {row.candidates.length > 0 && (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(row.bank_transaction_id)}
                    onChange={() => toggleRow(row.bank_transaction_id)}
                    data-testid={`link-suggestion-select-${row.bank_transaction_id}`}
                    title={row.candidates[0]?.exact_match ? "Pre-ticked: exact amount/date/payee match" : "Not pre-ticked: not a 100% exact match"}
                  />
                )}
                {row.candidates[0]?.exact_match === true && (
                  <span
                    className="rounded-sm bg-[#E7F6EC] px-1 py-0.5 font-extrabold uppercase tracking-[.05em] text-[#1C6B37]"
                    style={{ fontSize: "9px" }}
                    data-testid={`link-suggestion-exact-${row.bank_transaction_id}`}
                  >
                    exact
                  </span>
                )}
                <span className="font-semibold text-gray-900">{formatDateUS(row.transaction_date)}</span>
                {/* §7 palette (BankingTransactionsDesignView.tsx's Spent/Received columns are the
                    canonical pattern: received=slate-700, spent=red-700) -- replaced an off-palette
                    hardcoded green hex color, caught live by verify-banking-palette-section7.mjs. */}
                <span
                  className={`tabular-nums font-semibold ${row.is_credit ? "text-slate-700" : "text-red-700"}`}
                >
                  {row.is_credit ? "+" : "-"}
                  {formatUsdCents(row.amount_cents)}
                </span>
                <span className="min-w-0 truncate text-gray-600">{row.merchant_name || row.description || "—"}</span>
                <button
                  type="button"
                  className="ml-auto text-[#8A2E2A] underline underline-offset-2"
                  disabled={anyMutationPending}
                  onClick={() => {
                    setExcludingId(row.bank_transaction_id);
                    setExcludeReason("");
                  }}
                  data-testid={`link-suggestion-exclude-open-${row.bank_transaction_id}`}
                >
                  Exclude
                </button>
              </div>

              {excludingId === row.bank_transaction_id && (
                <div className="mt-2 flex items-center gap-2 border-t border-[#F5C2C0] bg-[#FDEEEE] p-2">
                  <input
                    type="text"
                    autoFocus
                    value={excludeReason}
                    onChange={(e) => setExcludeReason(e.target.value)}
                    placeholder="Why does this transaction not need a match? (required)"
                    className="min-w-0 flex-1 rounded-sm border border-[#C7D2DC] px-2 py-1 text-xs"
                    data-testid={`link-suggestion-exclude-reason-${row.bank_transaction_id}`}
                  />
                  <button
                    type="button"
                    className={MONEY_DESTRUCTIVE_CLASS}
                    disabled={excludeReason.trim().length === 0 || excludeMutation.isPending}
                    onClick={() => excludeMutation.mutate({ bankTransactionId: row.bank_transaction_id, reason: excludeReason.trim() })}
                    data-testid={`link-suggestion-exclude-confirm-${row.bank_transaction_id}`}
                  >
                    {excludeMutation.isPending ? "Excluding…" : "Confirm exclude"}
                  </button>
                  <button
                    type="button"
                    className="text-gray-500"
                    onClick={() => {
                      setExcludingId(null);
                      setExcludeReason("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}

              {row.candidates.length === 0 ? (
                <p className="mt-1 text-gray-500">No candidate found within the date window.</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {row.candidates.map((c, idx) => (
                    <li key={`${c.obligation_type}-${c.obligation_id}`} className="flex flex-wrap items-center gap-2">
                      {row.candidates.length > 1 && idx === 0 && selectedIds.has(row.bank_transaction_id) && (
                        <span className="text-gray-400" title="The checkbox above accepts this, the top-ranked candidate">
                          ☑
                        </span>
                      )}
                      <ConfidenceChip confidence={c.confidence} />
                      <span className="text-gray-500">{CANDIDATE_KIND_LABEL[c.obligation_type] ?? c.obligation_type}</span>
                      <EntityLink kind={CANDIDATE_ENTITY_LINK_KIND[c.obligation_type] ?? "expense"} id={c.obligation_id} label={c.label} />
                      <span className="tabular-nums text-gray-700">{formatUsdCents(c.amount_cents)}</span>
                      <span className="text-gray-500">· {c.reason}</span>
                      <button
                        type="button"
                        className="ml-auto rounded-sm bg-[#1F6FEB] px-2 py-0.5 font-semibold text-white disabled:opacity-50"
                        disabled={anyMutationPending}
                        onClick={() =>
                          acceptMutation.mutate({
                            bankTransactionId: row.bank_transaction_id,
                            obligationType: c.obligation_type,
                            obligationId: c.obligation_id,
                          })
                        }
                        data-testid={`link-suggestion-match-${row.bank_transaction_id}-${c.obligation_id}`}
                      >
                        {acceptMutation.isPending && acceptMutation.variables?.obligationId === c.obligation_id ? "Matching…" : "Match"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
