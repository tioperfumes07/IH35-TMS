/**
 * Register row 97 — a vendor's SUGGESTED category: the account most of its live expenses post to, with its share
 * ("5000 Fuel & Diesel · 98% of 865 expenses"). The saved category is mdata.vendors.default_expense_account_id. The one
 * click here PATCHes the existing vendor update route; nothing is ever written automatically.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { updateVendor } from "../../api/mdata";
import { userFacingApiError } from "../../lib/api-error-message";

export type SuggestedCategoryData = {
  account_id: string;
  label: string;
  expenses: number;
  total_expenses: number;
  share_pct: number;
  saved_account_id: string | null;
  already_saved: boolean;
};

export function suggestedCategoryText(s: Pick<SuggestedCategoryData, "label" | "share_pct" | "total_expenses">): string {
  return `${s.label} · ${s.share_pct}% of ${s.total_expenses} expense${s.total_expenses === 1 ? "" : "s"}`;
}

export function SuggestedCategory(props: { vendorId: string; suggestion: SuggestedCategoryData | null; compact?: boolean }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (accountId: string) => updateVendor(props.vendorId, { default_expense_account_id: accountId }),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ["party-board", "vendors"] });
      void qc.invalidateQueries({ queryKey: ["vendor-profile"] });
    },
    onError: (e) => setError(userFacingApiError(e, "The category was not saved.")),
  });
  const s = props.suggestion;
  if (!s) return <span className="text-gray-500" data-testid="suggested-category-none">No operating-cost expense to suggest from</span>;
  if (s.already_saved) {
    return <span data-testid="suggested-category-saved" title={suggestedCategoryText(s)}>{s.label} <span className="text-gray-500">· saved</span></span>;
  }
  return (
    <span data-testid="suggested-category" className="inline-flex flex-wrap items-center gap-1.5">
      <span title={suggestedCategoryText(s)}>{props.compact ? `${s.label} · ${s.share_pct}%` : suggestedCategoryText(s)}</span>
      <button
        type="button"
        className="rounded-sm border border-gray-300 px-1.5 py-0.5 text-xs font-semibold text-[#1F2A44] hover:bg-gray-50 disabled:opacity-50"
        disabled={save.isPending}
        data-testid="suggested-category-set"
        onClick={(e) => { e.stopPropagation(); save.mutate(s.account_id); }}
      >
        {save.isPending ? "Saving…" : "Set as category"}
      </button>
      {error ? <span className="text-xs text-red-700" role="alert">{error}</span> : null}
    </span>
  );
}
