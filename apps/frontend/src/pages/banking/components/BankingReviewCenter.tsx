import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { ApiError } from "../../../api/client";
import {
  categorizeBankTransaction,
  getBankingUncategorized,
  getCoaAccounts,
  skipBankTransaction,
} from "../../../api/banking";
import {
  getBankingTransactionsReview,
  postBankTransactionAccept,
  postBankTransactionMatch,
  postBankTransactionsBatchAccept,
  postBankingRulesFromTransaction,
  type BankingReviewState,
} from "../../../api/banking-wave2";
import { ActionButton } from "../../../components/shared/ActionButton";
import { useToast } from "../../../components/Toast";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { formatCurrencyCents, formatDate } from "../../../lib/format";
import { BankingReviewMatchModal } from "./BankingReviewMatchModal";

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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [matchFor, setMatchFor] = useState<{ id: string; amount: number } | null>(null);
  const [drafts, setDrafts] = useState<
    Record<string, { vendor_id: string; account_id: string; class_id: string; memo: string }>
  >({});

  const reviewState = tabToState(tab);

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

  const coaQuery = useQuery({
    queryKey: ["catalogs", "coa-accounts", "banking-review"],
    queryFn: () => getCoaAccounts(),
    enabled: Boolean(companyId),
    staleTime: 120_000,
  });

  const coaOptions = coaQuery.data?.accounts ?? [];
  const rows = listQuery.data?.items ?? [];

  const getDraft = useCallback(
    (id: string, tx: Record<string, unknown>) => {
      const sug = readSuggestion(tx);
      return (
        drafts[id] ?? {
          vendor_id: sug.vendorId ?? "",
          account_id: sug.accountId ?? "",
          class_id: sug.classId ?? "",
          memo: "",
        }
      );
    },
    [drafts]
  );

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["banking"] });
    void listQuery.refetch();
  };

  const acceptOne = async (tx: Record<string, unknown>) => {
    const id = String(tx.id ?? "");
    const d = getDraft(id, tx);
    const sug = readSuggestion(tx);
    const vendorId = d.vendor_id.trim() || sug.vendorId || null;
    const accountId = d.account_id.trim() || sug.accountId || null;
    try {
      await postBankTransactionAccept(id, companyId, {
        vendor_id: vendorId,
        account_id: accountId,
        class_id: d.class_id.trim() || sug.classId || null,
        memo: d.memo.trim() || null,
      });
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 400 || e.status === 501)) {
        await categorizeBankTransaction(id, companyId, {
          category_kind: "bank_expense",
          vendor_id: vendorId ?? undefined,
          gl_account_id: accountId ?? undefined,
          memo: d.memo.trim() || undefined,
        });
        return;
      }
      throw e;
    }
  };

  const acceptMut = useMutation({
    mutationFn: acceptOne,
    onSuccess: () => {
      pushToast("Transaction accepted", "success");
      invalidate();
    },
    onError: (e) => pushToast(String((e as Error).message ?? "Accept failed"), "error"),
  });

  const batchAcceptMut = useMutation({
    mutationFn: async (ids: string[]) => {
      try {
        await postBankTransactionsBatchAccept(companyId, { transaction_ids: ids });
      } catch (e) {
        if (e instanceof ApiError && (e.status === 404 || e.status === 501)) {
          for (const id of ids) {
            const tx = rows.find((r) => String(r.id) === id);
            if (tx) await acceptOne(tx);
          }
          return;
        }
        throw e;
      }
    },
    onSuccess: () => {
      pushToast("Bulk accept applied", "success");
      setSelected({});
      invalidate();
    },
    onError: (e) => pushToast(String((e as Error).message ?? "Bulk accept failed"), "error"),
  });

  const excludeMut = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      await skipBankTransaction(id, companyId, { reason });
    },
    onSuccess: () => {
      pushToast("Transaction excluded", "success");
      invalidate();
    },
    onError: (e) => pushToast(String((e as Error).message ?? "Exclude failed"), "error"),
  });

  const bulkExcludeMut = useMutation({
    mutationFn: async ({ ids, reason }: { ids: string[]; reason: string }) => {
      for (const id of ids) {
        await skipBankTransaction(id, companyId, { reason });
      }
    },
    onSuccess: () => {
      pushToast("Excluded selected transactions", "success");
      setSelected({});
      invalidate();
    },
    onError: (e) => pushToast(String((e as Error).message ?? "Bulk exclude failed"), "error"),
  });

  const matchMut = useMutation({
    mutationFn: ({ transactionId, kind, target_id }: { transactionId: string; kind: string; target_id: string }) =>
      postBankTransactionMatch(transactionId, companyId, { kind, target_id }),
    onSuccess: () => {
      pushToast("Match recorded", "success");
      setMatchFor(null);
      invalidate();
    },
    onError: (e) => pushToast(String((e as Error).message ?? "Match failed — try categorize or accept."), "error"),
  });

  const ruleFromTxMut = useMutation({
    mutationFn: ({ id, gen }: { id: string; gen: string }) => postBankingRulesFromTransaction(id, companyId, gen),
    onSuccess: () => {
      pushToast("Rule created from transaction.", "success");
      void queryClient.invalidateQueries({ queryKey: ["banking", "rules"] });
    },
    onError: () => pushToast("Rule-from-transaction endpoint not available yet.", "info"),
  });

  const selectedIds = useMemo(() => Object.keys(selected).filter((k) => selected[k]), [selected]);

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
          <button type="button" className={tabClass("review")} onClick={() => { setTab("review"); setCursor(0); }}>
            For review
          </button>
          <button type="button" className={tabClass("categorized")} onClick={() => setTab("categorized")}>
            Categorized
          </button>
          <button type="button" className={tabClass("excluded")} onClick={() => { setTab("excluded"); setCursor(0); }}>
            Excluded
          </button>
        </div>
        {tab === "review" && selectedIds.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 pb-2">
            <span className="text-xs text-gray-700">{selectedIds.length} selected</span>
            <ActionButton
              type="button"
              className="border border-emerald-200 bg-emerald-50 text-emerald-900"
              aria-label="Bulk accept selected transactions"
              disabled={batchAcceptMut.isPending}
              onClick={() => void batchAcceptMut.mutateAsync(selectedIds)}
            >
              Bulk accept
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
                const draft = getDraft(id, tx);
                const expanded = expandedId === id;
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
                              {sug.source ? (
                                <span className="ml-2 text-gray-500">source: {String(sug.source)}</span>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      {tab === "review" ? (
                        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
                          <ActionButton
                            type="button"
                            className="border border-emerald-300 bg-emerald-50 text-emerald-900"
                            aria-label="Accept suggestion for transaction"
                            disabled={acceptMut.isPending}
                            onClick={() => void acceptMut.mutateAsync(tx)}
                          >
                            Accept
                          </ActionButton>
                          <ActionButton
                            type="button"
                            className="border border-gray-200 bg-white text-gray-800"
                            aria-label="Open match candidates"
                            onClick={() => setMatchFor({ id, amount: amt })}
                          >
                            Match
                          </ActionButton>
                          <ActionButton
                            type="button"
                            className="border border-gray-200 bg-white text-gray-800"
                            aria-label="Edit categorization fields"
                            onClick={() => setExpandedId((c) => (c === id ? null : id))}
                          >
                            Edit
                          </ActionButton>
                          <ActionButton
                            type="button"
                            className="border border-gray-200 bg-white text-gray-800"
                            aria-label="Exclude transaction"
                            disabled={excludeMut.isPending}
                            onClick={() => {
                              const reason = window.prompt("Exclude this transaction — reason?");
                              if (!reason?.trim()) return;
                              void excludeMut.mutateAsync({ id, reason: reason.trim() });
                            }}
                          >
                            Exclude
                          </ActionButton>
                          <ActionButton
                            type="button"
                            className="border border-blue-100 bg-blue-50 text-blue-900"
                            aria-label="Create rule from this transaction"
                            disabled={ruleFromTxMut.isPending}
                            onClick={() => void ruleFromTxMut.mutateAsync({ id, gen: "description_contains" })}
                          >
                            Create rule
                          </ActionButton>
                        </div>
                      ) : null}
                    </div>
                    {expanded ? (
                      <div className="space-y-2 border-t border-gray-100 bg-white px-3 py-2">
                        <label className="block text-[11px] font-medium text-gray-600">
                          Vendor id (UUID)
                          <input
                            className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                            value={draft.vendor_id}
                            onChange={(e) => setDrafts((d) => ({ ...d, [id]: { ...draft, vendor_id: e.target.value } }))}
                          />
                        </label>
                        <label className="block text-[11px] font-medium text-gray-600">
                          GL account
                          <select
                            className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                            value={draft.account_id}
                            onChange={(e) => setDrafts((d) => ({ ...d, [id]: { ...draft, account_id: e.target.value } }))}
                          >
                            <option value="">—</option>
                            {coaOptions.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.account_number ? `${a.account_number} · ` : ""}
                                {a.account_name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block text-[11px] font-medium text-gray-600">
                          Class id
                          <input
                            className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                            value={draft.class_id}
                            onChange={(e) => setDrafts((d) => ({ ...d, [id]: { ...draft, class_id: e.target.value } }))}
                          />
                        </label>
                        <label className="block text-[11px] font-medium text-gray-600">
                          Memo
                          <input
                            className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                            value={draft.memo}
                            onChange={(e) => setDrafts((d) => ({ ...d, [id]: { ...draft, memo: e.target.value } }))}
                          />
                        </label>
                        <p className="text-[10px] text-gray-500">
                          Split lines (1→N) ship as a follow-up when the split endpoint is wired to this editor.
                        </p>
                      </div>
                    ) : null}
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

      <BankingReviewMatchModal
        open={Boolean(matchFor)}
        transactionId={matchFor?.id ?? null}
        companyId={companyId}
        amountCents={matchFor?.amount ?? 0}
        onClose={() => setMatchFor(null)}
        onMatched={() => {
          setMatchFor(null);
          invalidate();
        }}
        matchMutation={{ mutateAsync: (a) => matchMut.mutateAsync(a), isPending: matchMut.isPending }}
      />
    </div>
  );
}
