import { useMutation, useQuery } from "@tanstack/react-query";
import { bankMatch, getReconcileSuggestions, type ObligationType, type ReconcileSuggestion } from "../../api/banking";
import { useToast } from "../../components/Toast";

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
      pushToast(String((error as Error).message ?? "Failed to apply factoring match"), "error");
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
          <button
            key={`${suggestion.obligation_id}-${suggestion.obligation_type}`}
            type="button"
            disabled={props.disabled}
            title="Apply this match"
            onClick={() => props.onAccept(suggestion.obligation_type as ObligationType, suggestion.obligation_id)}
            className="rounded bg-amber-50 px-1 text-[10px] text-amber-900 enabled:hover:bg-amber-100 disabled:opacity-50"
          >
            {suggestion.label} ({Math.round(suggestion.confidence * 100)}%)
          </button>
        )
      )}
    </div>
  );
}

function FactoringSuggestionChip(props: { suggestion: ReconcileSuggestion; disabled?: boolean; onApply: () => void }) {
  return (
    <div className="flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-1 py-[1px] text-[10px] text-blue-900">
      <span className="rounded bg-blue-700 px-1 text-[9px] font-semibold uppercase tracking-wide text-white">Factoring</span>
      <span>{props.suggestion.batch_number ?? props.suggestion.label}</span>
      <span>({Math.round(props.suggestion.confidence * 100)}%)</span>
      <button
        type="button"
        disabled={props.disabled}
        onClick={props.onApply}
        className="rounded bg-blue-600 px-1 text-[9px] text-white enabled:hover:bg-blue-700 disabled:opacity-50"
      >
        Apply
      </button>
    </div>
  );
}
