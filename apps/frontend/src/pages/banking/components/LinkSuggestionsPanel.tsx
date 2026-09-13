import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  acceptLinkSuggestion,
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
// with the existing split-transaction flow), and the row-checkbox/shift-click/batch-accept +
// "Modify Selected, Then Accept" batch UI. A backend POST /reject already exists so a future Find
// match can mark the suggestion it replaces as rejected (banking.reconciliation_matches,
// match_state='rejected') without a second guess resurfacing it — not exposed as its own button
// here because "reject a single candidate" isn't one of the six named verbs.
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

  if (query.isError) return <ListErrorBanner onRetry={() => void query.refetch()} />;
  if (query.isPending) return <p className="p-3 text-xs text-gray-600">Loading suggestions…</p>;

  const rows = query.data.transactions;
  const withCandidates = rows.filter((r) => r.candidates.length > 0).length;
  const anyMutationPending = acceptMutation.isPending || excludeMutation.isPending || undoMutation.isPending;

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
                <span className="font-semibold text-gray-900">{formatDateUS(row.transaction_date)}</span>
                <span className="tabular-nums font-semibold" style={{ color: row.is_credit ? "#166534" : "#1F2937" }}>
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
                <div className="mt-2 flex items-center gap-2 rounded-sm border border-[#F5C2C0] bg-[#FDEEEE] p-2">
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
                  {row.candidates.map((c) => (
                    <li key={`${c.obligation_type}-${c.obligation_id}`} className="flex flex-wrap items-center gap-2">
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
