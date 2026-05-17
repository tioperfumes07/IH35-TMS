import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { categorizeBankTransaction, getBankingUncategorized, getCoaAccounts, type UncategorizedBankTransactionsQuery } from "../../../api/banking";
import { ActionButton } from "../../../components/shared/ActionButton";
import { useToast } from "../../../components/Toast";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";

export type BankingReviewDataSource = "uncategorized" | "review";

function formatMoneyCents(cents: number | null | undefined) {
  if (cents == null || Number.isNaN(Number(cents))) return "—";
  const n = Number(cents) / 100;
  const abs = Math.abs(n);
  const formatted = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(abs);
  return n < 0 ? `(${formatted})` : formatted;
}

function txDate(tx: Record<string, unknown>) {
  return String(tx.transaction_date ?? "");
}

function txDesc(tx: Record<string, unknown>) {
  return String(tx.description ?? tx.merchant_name ?? "—");
}

function txAmountCents(tx: Record<string, unknown>): number {
  if (tx.amount_cents != null && tx.amount_cents !== "") return Number(tx.amount_cents);
  return 0;
}

function plaidPfc(tx: Record<string, unknown>): string {
  const raw = tx.plaid_category;
  if (Array.isArray(raw)) return raw.map(String).join(" / ");
  return "—";
}

function suggestionLabel(tx: Record<string, unknown>): string {
  const cat = tx.suggested_category_kind;
  if (cat != null && String(cat).trim()) return String(cat);
  return plaidPfc(tx);
}

function confidenceChipClasses(tx: Record<string, unknown>): string {
  const conf = tx.categorization_confidence;
  const s = String(conf ?? "");
  if (s === "rule_match") return "bg-emerald-100 text-emerald-900";
  if (s === "vendor_category_fallback") return "bg-blue-100 text-blue-900";
  return "bg-amber-100 text-amber-900";
}

type TabId = "review" | "categorized" | "excluded";

type Props = {
  companyId: string;
  /** Swap to `"review"` when Wave 2 `GET /banking/transactions/review` ships. */
  dataSource: BankingReviewDataSource;
  uncategorizedFilters?: UncategorizedBankTransactionsQuery;
  categorizedSection: React.ReactNode;
};

export function BankingReviewCenter({ companyId, dataSource, uncategorizedFilters, categorizedSection }: Props) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [tab, setTab] = useState<TabId>("review");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { category_kind: string; gl_account_id: string; memo: string }>>({});

  const uncQuery = useQuery({
    queryKey: ["banking", "review-center", "uncategorized", companyId, dataSource, uncategorizedFilters],
    queryFn: () => getBankingUncategorized(companyId, { limit: 50, ...uncategorizedFilters }),
    enabled: Boolean(companyId) && tab === "review" && dataSource === "uncategorized",
  });

  const coaQuery = useQuery({
    queryKey: ["catalogs", "coa-accounts", "review-center"],
    queryFn: () => getCoaAccounts(),
    enabled: Boolean(companyId) && tab === "review",
    staleTime: 120_000,
  });

  const acceptMutation = useMutation({
    mutationFn: async ({ id, category_kind, gl_account_id, memo }: { id: string; category_kind: string; gl_account_id: string; memo: string }) => {
      await categorizeBankTransaction(id, companyId, {
        category_kind,
        gl_account_id: gl_account_id || undefined,
        memo: memo || undefined,
      });
    },
    onSuccess: () => {
      pushToast("Transaction categorized", "success");
      void queryClient.invalidateQueries({ queryKey: ["banking"] });
      void uncQuery.refetch();
    },
    onError: (e: unknown) => pushToast(String((e as Error).message || "Categorize failed"), "error"),
  });

  const rows = uncQuery.data?.transactions ?? [];
  const coaOptions = coaQuery.data?.accounts ?? [];

  const tabClass = (id: TabId) =>
    `rounded-t border border-b-0 px-3 py-2 text-xs font-semibold uppercase tracking-wide ${
      tab === id ? "border-gray-300 bg-white text-gray-900" : "border-transparent text-gray-500 hover:text-gray-800"
    }`;

  return (
    <div className="rounded border border-gray-200 bg-white">
      <div className="flex flex-wrap gap-1 border-b border-gray-200 bg-gray-50 px-2 pt-2">
        <button type="button" className={tabClass("review")} onClick={() => setTab("review")}>
          For review
        </button>
        <button type="button" className={tabClass("categorized")} onClick={() => setTab("categorized")}>
          Categorized
        </button>
        <button type="button" className={tabClass("excluded")} onClick={() => setTab("excluded")}>
          Excluded
        </button>
      </div>

      <div className="p-3">
        {tab === "review" && dataSource === "uncategorized" ? (
          <>
            {uncQuery.isError ? <ListErrorBanner onRetry={() => void uncQuery.refetch()} /> : null}
            {uncQuery.isLoading ? <p className="text-sm text-gray-600">Loading for-review transactions…</p> : null}
            <p className="mb-2 text-[11px] text-gray-500">
              Interim data: <span className="font-mono">GET /api/v1/banking/transactions/uncategorized</span>. After Wave 2, set{" "}
              <span className="font-mono">dataSource=&quot;review&quot;</span> to call <span className="font-mono">/banking/transactions/review</span>.
            </p>
            <div className="space-y-2">
              {rows.map((tx) => {
                const id = String(tx.id ?? "");
                const draft = drafts[id] ?? {
                  category_kind: String(tx.suggested_category_kind ?? "bank_expense"),
                  gl_account_id: "",
                  memo: "",
                };
                const expanded = expandedId === id;
                const amountCents = txAmountCents(tx);
                return (
                  <div key={id} className="rounded border border-gray-100 bg-gray-50/80">
                    <div className="flex flex-col gap-2 px-3 py-2 md:flex-row md:flex-wrap md:items-center md:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap gap-x-3 text-xs text-gray-900">
                          <span className="font-medium">{txDate(tx)}</span>
                          <span className="truncate">{txDesc(tx)}</span>
                          <span className={amountCents < 0 ? "font-semibold text-red-700" : "font-semibold text-gray-900"}>
                            {formatMoneyCents(amountCents)}
                          </span>
                          <span className="text-gray-600">{String(tx.coa_account_name ?? tx.account_name ?? "—")}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 pl-0 text-[11px] text-gray-700 md:pl-4">
                          <span className="text-gray-500">Suggestion:</span>
                          <span>{suggestionLabel(tx)}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${confidenceChipClasses(tx)}`}>
                            {String(tx.categorization_confidence ?? "low_signal")}
                          </span>
                          <span className="text-gray-400">PFC: {plaidPfc(tx)}</span>
                        </div>
                      </div>
                      <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
                        <ActionButton
                          type="button"
                          className="border border-emerald-300 bg-emerald-50 text-emerald-900"
                          disabled={acceptMutation.isPending || !draft.category_kind.trim()}
                          onClick={() =>
                            void acceptMutation.mutateAsync({
                              id,
                              category_kind: draft.category_kind.trim(),
                              gl_account_id: draft.gl_account_id,
                              memo: draft.memo,
                            })
                          }
                        >
                          Accept
                        </ActionButton>
                        <button
                          type="button"
                          className="rounded border border-gray-300 bg-white px-2 py-1 text-[11px] text-gray-500"
                          disabled
                          title="Match drawer ships with Wave 2 /banking/transactions/:id/match-candidates"
                        >
                          Match
                        </button>
                        <button
                          type="button"
                          className="rounded border border-gray-300 bg-white px-2 py-1 text-[11px] text-gray-500"
                          disabled
                          title="Split ships with Wave 2"
                        >
                          Split
                        </button>
                        <button
                          type="button"
                          className="rounded border border-gray-200 bg-gray-100 px-2 py-1 text-[11px] text-gray-400"
                          disabled
                          title="Available after Wave 2 backend deploy"
                        >
                          Exclude
                        </button>
                        <button
                          type="button"
                          className="text-[11px] font-medium text-blue-700 underline"
                          onClick={() => setExpandedId((c) => (c === id ? null : id))}
                        >
                          {expanded ? "Collapse" : "Edit"}
                        </button>
                      </div>
                    </div>
                    {expanded ? (
                      <div className="space-y-2 border-t border-gray-100 bg-white px-3 py-2">
                        <label className="block text-[11px] font-medium text-gray-600">
                          Category kind
                          <input
                            className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                            value={draft.category_kind}
                            onChange={(e) => setDrafts((d) => ({ ...d, [id]: { ...draft, category_kind: e.target.value } }))}
                          />
                        </label>
                        <label className="block text-[11px] font-medium text-gray-600">
                          GL account
                          <SelectCombobox
                            className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                            value={draft.gl_account_id}
                            onChange={(e) => setDrafts((d) => ({ ...d, [id]: { ...draft, gl_account_id: e.target.value } }))}
                          >
                            <option value="">—</option>
                            {coaOptions.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.account_number ? `${a.account_number} · ` : ""}
                                {a.account_name}
                              </option>
                            ))}
                          </SelectCombobox>
                        </label>
                        <label className="block text-[11px] font-medium text-gray-600">
                          Memo
                          <input
                            className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                            value={draft.memo}
                            onChange={(e) => setDrafts((d) => ({ ...d, [id]: { ...draft, memo: e.target.value } }))}
                          />
                        </label>
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {!uncQuery.isLoading && rows.length === 0 ? (
                <p className="text-sm text-gray-600">No transactions pending review for this company.</p>
              ) : null}
            </div>
          </>
        ) : null}

        {tab === "review" && dataSource === "review" ? (
          <p className="text-sm text-gray-600">
            Wave 2 <span className="font-mono">GET /api/v1/banking/transactions/review</span> not wired in this build. Toggle{" "}
            <span className="font-mono">dataSource</span> to <span className="font-mono">uncategorized</span> for interim review.
          </p>
        ) : null}

        {tab === "categorized" ? <div>{categorizedSection}</div> : null}

        {tab === "excluded" ? (
          <div className="rounded border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
            Excluded / skipped banking transactions will list here after Wave 2 aggregates them via{" "}
            <span className="font-mono">/banking/transactions/review</span> (or a dedicated excluded feed).
          </div>
        ) : null}
      </div>
    </div>
  );
}
