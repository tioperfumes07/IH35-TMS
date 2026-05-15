import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ApiError } from "../../../api/client";
import { getBankingUncategorized } from "../../../api/banking";
import { getBankingTransactionsReview, postBankTransactionExclude, type BankingReviewState } from "../../../api/banking-wave2";
import { ActionButton } from "../../../components/shared/ActionButton";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { useToast } from "../../../components/Toast";
import { formatCurrencyCents, formatDate } from "../../../lib/format";
import { CategorizeTransactionModal, type CategorizeModalMode } from "./CategorizeTransactionModal";

type TabId = "review" | "categorized" | "excluded";

function tabToState(tab: TabId): BankingReviewState {
  if (tab === "review") return "for_review";
  if (tab === "categorized") return "categorized";
  return "excluded";
}

function readSuggestion(tx: Record<string, unknown>) {
  const raw = tx.suggestion as Record<string, unknown> | null | undefined;
  const vendorId = (tx.suggested_vendor_id ?? raw?.vendor_id ?? null) as string | null;
  const accountId = (tx.suggested_account_id ?? raw?.account_id ?? null) as string | null;
  const classId = (tx.suggested_class_id ?? raw?.class_id ?? null) as string | null;
  const confidence = (raw?.confidence ?? tx.suggested_confidence ?? null) as string | null;
  const source = (raw?.source ?? tx.suggested_source ?? null) as string | null;
  const vendorName = String(tx.suggested_vendor_name ?? tx.vendor_display_name ?? "").trim();
  const accountName = String(tx.suggested_account_name ?? tx.coa_account_name ?? tx.account_name ?? "").trim();
  return { vendorId, accountId, classId, confidence, source, vendorName, accountName };
}

function normalizeSourceLabel(raw: string | null): string {
  if (!raw) return "";
  const s = String(raw).trim().toLowerCase();
  const map: Record<string, string> = {
    rule: "rule",
    vendor_history: "vendor_history",
    description_history: "description_history",
    plaid_pfc: "plaid_pfc",
  };
  return map[s] ?? s.replace(/\s+/g, "_");
}

function SuggestionSourcePill({ source }: { source: string | null }) {
  const bases = ["rule", "vendor_history", "description_history", "plaid_pfc"] as const;
  const n = normalizeSourceLabel(source);
  return (
    <div className="mt-1 text-[10px] text-gray-500">
      <span className="text-gray-600">Source </span>
      {bases.map((b, i) => (
        <span key={b}>
          {i > 0 ? " | " : null}
          <span className={n === b ? "font-semibold text-gray-800" : undefined}>{b}</span>
        </span>
      ))}
    </div>
  );
}

function txAmount(tx: Record<string, unknown>): number {
  if (tx.amount_cents != null && tx.amount_cents !== "") return Number(tx.amount_cents);
  return 0;
}

type Props = {
  companyId: string;
  categorizedSection: React.ReactNode;
};

export function BankingReviewCenter({ companyId, categorizedSection }: Props) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [tab, setTab] = useState<TabId>("review");
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [categorizeModal, setCategorizeModal] = useState<{
    ids: string[];
    mode: CategorizeModalMode;
    preview: Record<string, unknown>;
  } | null>(null);

  const reviewState = tabToState(tab);

  const openModal = (tx: Record<string, unknown>, mode: CategorizeModalMode) => {
    const id = String(tx.id ?? "");
    setCategorizeModal({
      ids: [id],
      mode,
      preview: { ...tx },
    });
  };

  const listQuery = useQuery({
    queryKey: ["banking", "transactions-review", companyId, reviewState, cursor],
    queryFn: async () => {
      try {
        const res = await getBankingTransactionsReview(companyId, { state: reviewState, limit: 50, cursor });
        return { items: res.items ?? [], next_cursor: res.next_cursor ?? 0, legacy: false as const };
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          if (reviewState === "for_review") {
            const leg = await getBankingUncategorized(companyId, { limit: 50, offset: cursor });
            return { items: leg.transactions ?? [], next_cursor: cursor + (leg.transactions?.length ?? 0), legacy: true as const };
          }
          return { items: [], next_cursor: 0, legacy: true as const };
        }
        throw e;
      }
    },
    enabled: Boolean(companyId) && tab !== "categorized",
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["banking"] });
    void listQuery.refetch();
  };

  const bulkExcludeMut = useMutation({
    mutationFn: async ({ ids, reason }: { ids: string[]; reason: string }) => {
      for (const id of ids) {
        await postBankTransactionExclude(id, companyId, { reason });
      }
    },
    onSuccess: () => {
      pushToast("Excluded selected transactions", "success");
      setSelected({});
      invalidate();
    },
    onError: (e) => pushToast(String((e as Error).message ?? "Bulk exclude failed"), "error"),
  });

  const selectedIds = useMemo(() => Object.keys(selected).filter((k) => selected[k]), [selected]);
  const rows = listQuery.data?.items ?? [];

  const tabClass = (id: TabId) =>
    `rounded-t border border-b-0 px-3 py-2 text-xs font-semibold uppercase tracking-wide ${
      tab === id ? "border-gray-300 bg-white text-gray-900" : "border-transparent text-gray-500 hover:text-gray-800"
    }`;

  const toggleRow = (id: string) => {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  };

  const onBulkExclude = () => {
    if (!selectedIds.length) return;
    const reason = window.prompt("Reason for excluding these transactions?");
    if (!reason?.trim()) return;
    void bulkExcludeMut.mutateAsync({ ids: selectedIds, reason: reason.trim() });
  };

  return (
    <div className="rounded border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-2 pt-2">
        <div className="flex flex-wrap gap-1">
          <button type="button" className={tabClass("review")} onClick={() => { setTab("review"); setCursor(0); }} aria-label="For review tab">
            For review
          </button>
          <button type="button" className={tabClass("categorized")} onClick={() => setTab("categorized")} aria-label="Categorized tab">
            Categorized
          </button>
          <button type="button" className={tabClass("excluded")} onClick={() => { setTab("excluded"); setCursor(0); }} aria-label="Excluded tab">
            Excluded
          </button>
        </div>
        {tab === "review" && selectedIds.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 pb-2">
            <span className="text-xs text-gray-700">{selectedIds.length} selected</span>
            <ActionButton
              type="button"
              className="border border-emerald-200 bg-emerald-50 text-emerald-900"
              aria-label="Bulk categorize selected transactions"
              onClick={() => {
                const first = rows.find((r) => selectedIds.includes(String(r.id ?? "")));
                if (!first) return;
                setCategorizeModal({
                  ids: selectedIds,
                  mode: "categorize",
                  preview: { ...first },
                });
              }}
            >
              Categorize…
            </ActionButton>
            <ActionButton
              type="button"
              className="border border-gray-200 bg-white text-gray-800"
              aria-label="Bulk exclude selected transactions"
              disabled={bulkExcludeMut.isPending}
              onClick={onBulkExclude}
            >
              Bulk exclude
            </ActionButton>
          </div>
        ) : null}
      </div>

      <div className="p-3">
        {listQuery.data?.legacy ? (
          <p className="mb-2 text-[11px] text-amber-800">
            Review API unavailable — showing legacy <span className="font-mono">/uncategorized</span> feed.
          </p>
        ) : null}

        {tab === "review" || tab === "excluded" ? (
          <>
            {listQuery.isError ? <ListErrorBanner onRetry={() => void listQuery.refetch()} /> : null}
            {listQuery.isLoading ? <p className="text-sm text-gray-600">Loading…</p> : null}
            <div className="space-y-2">
              {rows.map((tx) => {
                const id = String(tx.id ?? "");
                const sug = readSuggestion(tx);
                const amt = txAmount(tx);
                const showSuggestionRow =
                  tab === "review" && (Boolean(sug.vendorId || sug.accountId) || Boolean(tx.suggestion));
                return (
                  <div key={id} className="rounded border border-gray-100 bg-gray-50/80">
                    <div className="flex flex-col gap-2 px-3 py-2 md:flex-row md:flex-wrap md:items-start md:justify-between">
                      <div className="flex min-w-0 flex-1 gap-2">
                        {tab === "review" ? (
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={Boolean(selected[id])}
                            onChange={() => toggleRow(id)}
                            aria-label={`Select transaction ${id}`}
                          />
                        ) : null}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap gap-x-3 text-xs text-gray-900">
                            <span className="font-medium">{formatDate(String(tx.transaction_date ?? ""))}</span>
                            <span className="truncate">{String(tx.description ?? tx.merchant_name ?? "—")}</span>
                            <span className={amt < 0 ? "font-semibold text-red-700" : "font-semibold text-gray-900"}>
                              {formatCurrencyCents(amt)}
                            </span>
                            <span className="text-gray-600">{String(tx.bank_account_name ?? tx.account_name ?? "—")}</span>
                          </div>
                          {showSuggestionRow ? (
                            <div className="mt-1 pl-0 text-[11px] text-gray-700 md:pl-6">
                              <span className="font-medium text-gray-800">
                                {sug.vendorName || sug.vendorId || "Vendor suggestion"}
                              </span>
                              {sug.accountName || sug.accountId ? (
                                <>
                                  {" "}
                                  → <span>{sug.accountName || sug.accountId}</span>
                                </>
                              ) : null}
                              {sug.confidence ? (
                                <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px]">
                                  confidence: {String(sug.confidence)}
                                </span>
                              ) : null}
                              <SuggestionSourcePill source={sug.source} />
                            </div>
                          ) : null}
                        </div>
                      </div>
                      {tab === "review" ? (
                        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
                          <ActionButton
                            type="button"
                            className="border border-emerald-300 bg-emerald-50 text-emerald-900"
                            aria-label="Accept suggestion in categorize modal"
                            onClick={() => openModal(tx, "categorize")}
                          >
                            Accept
                          </ActionButton>
                          <ActionButton
                            type="button"
                            className="border border-gray-200 bg-white text-gray-800"
                            aria-label="Open match mode"
                            onClick={() => openModal(tx, "match")}
                          >
                            Match
                          </ActionButton>
                          <ActionButton
                            type="button"
                            className="border border-gray-200 bg-white text-gray-800"
                            aria-label="Edit in categorize modal"
                            onClick={() => openModal(tx, "categorize")}
                          >
                            Edit
                          </ActionButton>
                          <ActionButton
                            type="button"
                            className="border border-gray-200 bg-white text-gray-800"
                            aria-label="Exclude via categorize modal"
                            onClick={() => openModal(tx, "categorize")}
                          >
                            Exclude
                          </ActionButton>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              {!listQuery.isLoading && rows.length === 0 ? (
                <p className="text-sm text-gray-600">No transactions in this tab.</p>
              ) : null}
              {listQuery.data && !listQuery.data.legacy && rows.length >= 50 ? (
                <div className="flex justify-end">
                  <button
                    type="button"
                    className="text-xs font-medium text-blue-700 underline"
                    aria-label="Load more transactions"
                    onClick={() => setCursor(listQuery.data?.next_cursor ?? cursor + 50)}
                  >
                    Load more
                  </button>
                </div>
              ) : null}
            </div>
          </>
        ) : null}

        {tab === "categorized" ? <div>{categorizedSection}</div> : null}
      </div>

      {categorizeModal ? (
        <CategorizeTransactionModal
          operatingCompanyId={companyId}
          transactionIds={categorizeModal.ids}
          open
          initialMode={categorizeModal.mode}
          transactionPreview={categorizeModal.preview}
          onClose={() => setCategorizeModal(null)}
          onSaved={() => {
            setCategorizeModal(null);
            setSelected({});
            invalidate();
          }}
        />
      ) : null}
    </div>
  );
}
