import { useMutation, useQuery } from "@tanstack/react-query";
import {
  bankMatch,
  getReconcileSuggestions,
  type ObligationType,
  type ReconcileSuggestion,
  type ReconcileSuggestionType,
} from "../../api/banking";
import { useToast } from "../../components/Toast";
import { EntityLink, type EntityKind } from "../../components/shared/EntityLink";
import { userFacingApiError } from "../../lib/api-error-message";

const SUGGESTION_ENTITY_KIND: Record<ReconcileSuggestionType, EntityKind> = {
  load: "load",
  settlement: "settlement",
  fuel: "fuel_transaction",
  work_order: "work_order",
  ar_invoice: "invoice",
  bill: "bill",
  factoring_batch: "factoring_batch",
};

export function ReconMatchSuggestions(props: {
  companyId: string;
  bankTransactionId: string;
  disabled?: boolean;
  onAccept: (obligation_type: ObligationType, obligation_id: string) => void;
  onFactoringApplied: () => void;
}) {
  const { pushToast } = useToast();
  const suggestionsQuery = useQuery({
    queryKey: ["banking", "reconcile-suggestions", props.companyId, props.bankTransactionId],
    queryFn: () => getReconcileSuggestions(props.companyId, props.bankTransactionId),
    enabled: Boolean(props.companyId && props.bankTransactionId),
  });

  const applyFactoringMutation = useMutation({
    mutationFn: async (suggestionId: string) => bankMatch.applyMatch(props.companyId, suggestionId),
    onSuccess: () => {
      pushToast("Factoring match applied", "success");
      props.onFactoringApplied();
    },
    onError: (error) => {
      pushToast(userFacingApiError(error, "Failed to apply factoring match"), "error");
    },
  });

  const suggestions = suggestionsQuery.data?.suggestions ?? [];
  if (suggestions.length === 0) return null;

  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {suggestions.map((suggestion) =>
        suggestion.suggestion_source === "factoring" ? (
          <FactoringSuggestionChip
            key={`${suggestion.obligation_id}-${suggestion.bank_match_suggestion_id ?? "factoring"}`}
            suggestion={suggestion}
            disabled={props.disabled || applyFactoringMutation.isPending}
            onApply={() => {
              if (!suggestion.bank_match_suggestion_id) return;
              applyFactoringMutation.mutate(suggestion.bank_match_suggestion_id);
            }}
          />
        ) : (
          <div
            key={`${suggestion.obligation_id}-${suggestion.obligation_type}`}
            className="flex items-center gap-1 rounded-sm bg-slate-100 px-1 text-[10px] text-slate-700"
          >
            <EntityLink
              kind={SUGGESTION_ENTITY_KIND[suggestion.obligation_type]}
              id={suggestion.obligation_id}
              label={suggestion.label}
            />
            <span>({Math.round(suggestion.confidence * 100)}%)</span>
            <button
              type="button"
              disabled={props.disabled}
              title="Apply this match"
              onClick={() => props.onAccept(suggestion.obligation_type as ObligationType, suggestion.obligation_id)}
              className="rounded-sm bg-slate-200 px-1 text-[9px] enabled:hover:bg-slate-300 disabled:opacity-50"
            >
              Apply
            </button>
          </div>
        )
      )}
    </div>
  );
}

function FactoringSuggestionChip(props: { suggestion: ReconcileSuggestion; disabled?: boolean; onApply: () => void }) {
  return (
    <div className="flex items-center gap-1 rounded-sm border border-slate-300 bg-slate-100 px-1 py-px text-[10px] text-slate-700">
      <EntityLink
        kind="factoring_batch"
        id={props.suggestion.obligation_id}
        label={`Factoring ${props.suggestion.batch_number ?? "batch"}`}
        className="rounded-sm bg-[#1F2A44] px-1 text-[9px] font-semibold uppercase tracking-wide text-white"
      />
      <span>({Math.round(props.suggestion.confidence * 100)}%)</span>
      <button
        type="button"
        disabled={props.disabled}
        onClick={props.onApply}
        className="rounded-sm bg-[#1F2A44] px-1 text-[9px] text-white enabled:hover:bg-[#1F2A44] disabled:opacity-50"
      >
        Apply
      </button>
    </div>
  );
}
