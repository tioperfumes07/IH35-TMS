import { useQuery } from "@tanstack/react-query";
import { getLinkSuggestions } from "../../../api/banking";
import { EntityLink } from "../../../components/shared/EntityLink";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { MONEY_TONE_COLORS, type MoneyTone } from "../../../design/money-design-system";
import { formatUsdCents } from "../../../lib/money";
import { formatDateUS } from "../../../lib/formatDate";

// LOAD-TO-CASH CHAIN, LINK 4 — PR 1 (READ-ONLY). Owner law B, verbatim (2026-09-12): "it should
// never automatch, it suggests and we accept it or change the transactions." This panel renders
// candidates ONLY — there is no Accept/Reject control anywhere in this file. That flow is PR 2, a
// separate, later change; adding a write control here before that PR lands would be exactly the
// kind of premature automation the owner ruled out.
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

export function LinkSuggestionsPanel({ companyId }: { companyId: string }) {
  const query = useQuery({
    queryKey: ["banking", "link-suggestions", companyId],
    queryFn: () => getLinkSuggestions(companyId),
    enabled: Boolean(companyId),
  });

  if (query.isError) return <ListErrorBanner onRetry={() => void query.refetch()} />;
  if (query.isPending) return <p className="p-3 text-xs text-gray-600">Loading suggestions…</p>;

  const rows = query.data.transactions;
  const withCandidates = rows.filter((r) => r.candidates.length > 0).length;

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
          Suggestions only — nothing here is written until a human accepts, rejects, or changes a transaction. That
          confirm/reject flow ships next; this screen is read-only.
        </p>
      </div>
      <div className="max-h-[70vh] overflow-y-auto rounded-[9px] border border-[#C7D2DC] bg-white">
        {rows.length === 0 ? (
          <p className="p-3 text-xs text-gray-600">Every transaction already carries a link on one of the five tracked columns.</p>
        ) : (
          rows.map((row) => (
            <div key={row.bank_transaction_id} className="border-b border-gray-100 px-3 py-2 text-xs last:border-b-0" data-testid={`link-suggestion-row-${row.bank_transaction_id}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-gray-900">{formatDateUS(row.transaction_date)}</span>
                <span className="tabular-nums font-semibold" style={{ color: row.is_credit ? "#166534" : "#1F2937" }}>
                  {row.is_credit ? "+" : "-"}
                  {formatUsdCents(row.amount_cents)}
                </span>
                <span className="min-w-0 truncate text-gray-600">{row.merchant_name || row.description || "—"}</span>
              </div>
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
