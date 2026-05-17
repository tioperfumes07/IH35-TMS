import { useMemo, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  bulkCategorizeBankTransactions,
  categorizeBankTransactionToAccount,
  categorizeTransaction,
  getBankingKpis,
  getBankingSuggestions,
  getBankingUncategorized,
  getCoaAccounts,
  getPlaidBankAccounts,
  skipBankTransactionInvestigation,
  type UncategorizedBankTransactionsMeta,
} from "../../api/banking";
import { ApiError } from "../../api/client";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { PageHeader } from "../../components/layout/PageHeader";
import { useToast } from "../../components/Toast";
import { ManualJEModal } from "./components/ManualJEModal";
import { TransferModal } from "./TransferModal";
import { SelectCombobox } from "../../components/shared/SelectCombobox";

function txDate(tx: Record<string, unknown>) {
  return String(tx.transaction_date ?? tx.txn_date ?? "");
}

function txAmountCents(tx: Record<string, unknown>) {
  if (tx.amount_cents != null && tx.amount_cents !== "") return Number(tx.amount_cents);
  if (tx.amount != null && tx.amount !== "") return Math.round(Number(tx.amount) * 100);
  return 0;
}

function txDescription(tx: Record<string, unknown>) {
  return String(tx.description ?? tx.merchant_name ?? "");
}

function txBankLabel(tx: Record<string, unknown>) {
  return String(tx.bank_account_name ?? tx.account_name ?? tx.institution_name ?? "—");
}

function suggestionLabel(s: Record<string, unknown>) {
  return String(s.account_name ?? s.coa_account_name ?? s.category ?? s.label ?? "Suggestion");
}

function suggestionConfidence(s: Record<string, unknown>) {
  const c = s.confidence ?? s.confidence_score ?? s.score;
  if (c == null) return null;
  const n = Number(c);
  if (!Number.isFinite(n)) return null;
  return n <= 1 ? Math.round(n * 1000) / 10 : Math.round(n * 10) / 10;
}

function coaIdFromSuggestion(s: Record<string, unknown>) {
  const id = s.coa_account_id ?? s.account_id;
  return id ? String(id) : "";
}

function formatMoneyCents(cents: number | null | undefined) {
  if (cents == null || Number.isNaN(Number(cents))) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(cents) / 100);
}

function mergeMeta(
  meta: UncategorizedBankTransactionsMeta | undefined,
  kpi: Record<string, unknown> | undefined
): {
  uncategorized_count?: number;
  total_uncategorized_amount_cents?: number;
  processed_this_week_count?: number;
  auto_categorize_hit_rate_pct?: number | null | undefined;
} {
  return {
    uncategorized_count: meta?.uncategorized_count ?? (kpi?.total_uncategorized != null ? Number(kpi.total_uncategorized) : undefined),
    total_uncategorized_amount_cents:
      meta?.total_uncategorized_amount_cents ??
      (kpi?.uncategorized_total_amount_cents != null ? Number(kpi.uncategorized_total_amount_cents) : undefined),
    processed_this_week_count:
      meta?.processed_this_week_count ??
      (kpi?.categorization_processed_this_week != null ? Number(kpi.categorization_processed_this_week) : undefined),
    auto_categorize_hit_rate_pct:
      meta?.auto_categorize_hit_rate_pct ??
      (kpi?.auto_categorize_hit_rate_pct != null ? Number(kpi.auto_categorize_hit_rate_pct) : undefined),
  };
}

export function BankTxCategorizationPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const [accountPick, setAccountPick] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [search, setSearch] = useState("");
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [bulkSelected, setBulkSelected] = useState<Record<string, boolean>>({});
  const [coaPickByTx, setCoaPickByTx] = useState<Record<string, string>>({});
  const [batchCoaId, setBatchCoaId] = useState("");

  const [manualJeOpen, setManualJeOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferLinkId, setTransferLinkId] = useState<string | null>(null);
  const [manualPrefill, setManualPrefill] = useState<{ date?: string; memo?: string } | null>(null);
  const [transferPrefill, setTransferPrefill] = useState<{
    from_account_id?: string;
    to_account_id?: string;
    amount_cents?: number;
    transfer_date?: string;
    memo?: string;
  } | null>(null);

  const [skipTx, setSkipTx] = useState<Record<string, unknown> | null>(null);
  const [skipNote, setSkipNote] = useState("");

  const filterQuery = useMemo(() => {
    const amountMinCents = amountMin.trim() ? Math.round(Number(amountMin) * 100) : undefined;
    const amountMaxCents = amountMax.trim() ? Math.round(Number(amountMax) * 100) : undefined;
    return {
      bank_account_id: accountPick.length === 1 ? accountPick[0] : undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      amount_min_cents: amountMinCents != null && Number.isFinite(amountMinCents) ? amountMinCents : undefined,
      amount_max_cents: amountMaxCents != null && Number.isFinite(amountMaxCents) ? amountMaxCents : undefined,
      search: search.trim() || undefined,
      limit: 200,
    };
  }, [accountPick, dateFrom, dateTo, amountMin, amountMax, search]);

  const kpiQuery = useQuery({
    queryKey: ["banking", "kpis", companyId, "categorize-page"],
    queryFn: () => getBankingKpis(companyId),
    enabled: Boolean(companyId),
  });

  const uncQuery = useQuery({
    queryKey: ["banking", "uncategorized", companyId, filterQuery],
    queryFn: () => getBankingUncategorized(companyId, filterQuery),
    enabled: Boolean(companyId),
    retry: false,
  });

  const bankAccountsQuery = useQuery({
    queryKey: ["banking", "plaid-accounts", companyId, "categorize-page"],
    queryFn: () => getPlaidBankAccounts(companyId),
    enabled: Boolean(companyId),
  });

  const coaQuery = useQuery({
    queryKey: ["banking", "coa-accounts", "categorize"],
    queryFn: getCoaAccounts,
    enabled: Boolean(companyId),
  });

  const backendPending =
    uncQuery.isError &&
    uncQuery.error instanceof ApiError &&
    (uncQuery.error.status === 404 || uncQuery.error.status === 500 || uncQuery.error.status === 501);

  const txs = useMemo(() => {
    const rows = uncQuery.data?.transactions ?? [];
    return [...rows].sort((a, b) => (txDate(b) || "").localeCompare(txDate(a) || ""));
  }, [uncQuery.data?.transactions]);

  const suggestionQueries = useQueries({
    queries: txs.map((tx) => ({
      queryKey: ["banking", "suggestions", companyId, String(tx.id)],
      queryFn: () => getBankingSuggestions(String(tx.id), companyId),
      enabled: Boolean(companyId && tx.id && !backendPending && !uncQuery.isLoading),
      staleTime: 60_000,
      retry: false,
    })),
  });

  const mergedMeta = mergeMeta(uncQuery.data?.meta, kpiQuery.data);
  const selectedTx = txs.find((t) => String(t.id) === selectedRowId) ?? null;

  const invalidateBanking = () => {
    void queryClient.invalidateQueries({ queryKey: ["banking"] });
  };

  const categorizeMut = useMutation({
    mutationFn: async ({ txId, accountId, memo }: { txId: string; accountId: string; memo?: string }) => {
      await categorizeBankTransactionToAccount(txId, companyId, { account_id: accountId, memo });
    },
    onSuccess: () => {
      pushToast("Transaction categorized", "success");
      invalidateBanking();
      void uncQuery.refetch();
    },
    onError: (e) => pushToast(String((e as Error).message ?? "Failed"), "error"),
  });

  const bulkMut = useMutation({
    mutationFn: async ({ ids, accountId }: { ids: string[]; accountId: string }) => {
      await bulkCategorizeBankTransactions(companyId, { transaction_ids: ids, account_id: accountId });
    },
    onSuccess: (_data, vars) => {
      pushToast(`Categorized ${vars.ids.length} transaction(s)`, "success");
      setBulkSelected({});
      invalidateBanking();
      void uncQuery.refetch();
    },
    onError: (e) => pushToast(String((e as Error).message ?? "Failed"), "error"),
  });

  const skipMut = useMutation({
    mutationFn: async ({ txId, note }: { txId: string; note: string }) => {
      await skipBankTransactionInvestigation(txId, companyId, { note });
    },
    onSuccess: () => {
      pushToast("Flagged for later review", "success");
      setSkipTx(null);
      setSkipNote("");
      invalidateBanking();
      void uncQuery.refetch();
    },
    onError: (e) => pushToast(String((e as Error).message ?? "Failed"), "error"),
  });

  const applySuggestion = async (txId: string, sugg: Record<string, unknown>) => {
    const coa = coaIdFromSuggestion(sugg);
    if (coa) {
      await categorizeMut.mutateAsync({ txId, accountId: coa });
      return;
    }
    await categorizeTransaction(txId, companyId, {
      action_type: String(sugg.category ?? "create_expense"),
      payload: { source_suggestion_id: String(sugg.id ?? "") },
    });
    pushToast("Suggestion applied", "success");
    invalidateBanking();
    void uncQuery.refetch();
  };

  const toggleBulk = (txId: string) => {
    setBulkSelected((prev) => ({ ...prev, [txId]: !prev[txId] }));
  };

  const bulkIds = Object.keys(bulkSelected).filter((id) => bulkSelected[id]);

  const applyBulkSuggestions = async () => {
    for (const txId of bulkIds) {
      const idx = txs.findIndex((t) => String(t.id) === txId);
      if (idx < 0) continue;
      const sugg = suggestionQueries[idx]?.data?.suggestions?.[0] as Record<string, unknown> | undefined;
      if (!sugg) continue;
      try {
        await applySuggestion(txId, sugg);
      } catch {
        /* continue batch */
      }
    }
  };

  const kpiUncCount = mergedMeta.uncategorized_count;
  const uncCountDisplay = kpiUncCount != null ? kpiUncCount : "—";

  return (
    <div className="space-y-3">
      <PageHeader title="Bank transaction categorization" subtitle="Uncategorized Plaid activity · daily ops" />
      {!companyId ? <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Select an operating company.</div> : null}

      {backendPending ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <span>
            Backend pending — file <strong>P6-T11204</strong> ticket. Uncategorized transaction endpoints are not available yet.
          </span>
          <Button size="sm" variant="secondary" onClick={() => void uncQuery.refetch()}>
            Retry
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="rounded border border-gray-200 bg-white px-3 py-2 text-xs">
          <div className="text-[10px] font-semibold uppercase text-gray-500">Uncategorized</div>
          <div className={`text-lg font-semibold ${Number(kpiUncCount ?? 0) > 0 ? "text-red-600" : "text-gray-900"}`}>
            {uncCountDisplay}
            {Number(kpiUncCount ?? 0) > 0 ? (
              <span className="ml-2 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">Action</span>
            ) : null}
          </div>
        </div>
        <div className="rounded border border-gray-200 bg-white px-3 py-2 text-xs">
          <div className="text-[10px] font-semibold uppercase text-gray-500">Total uncategorized amount</div>
          <div className="text-lg font-semibold text-gray-900">
            {formatMoneyCents(mergedMeta.total_uncategorized_amount_cents)}
          </div>
        </div>
        <div className="rounded border border-gray-200 bg-white px-3 py-2 text-xs">
          <div className="text-[10px] font-semibold uppercase text-gray-500">Processed this week</div>
          <div className="text-lg font-semibold text-gray-900">
            {mergedMeta.processed_this_week_count != null ? mergedMeta.processed_this_week_count : "—"}
          </div>
        </div>
        <div className="rounded border border-gray-200 bg-white px-3 py-2 text-xs">
          <div className="text-[10px] font-semibold uppercase text-gray-500">Auto-categorize hit rate</div>
          <div className="text-lg font-semibold text-gray-900">
            {mergedMeta.auto_categorize_hit_rate_pct != null && mergedMeta.auto_categorize_hit_rate_pct !== undefined
              ? `${Number(mergedMeta.auto_categorize_hit_rate_pct).toFixed(1)}%`
              : "—"}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row">
        <aside className="w-full shrink-0 space-y-2 rounded border border-gray-200 bg-white p-3 lg:w-60">
          <div className="text-xs font-semibold text-gray-800">Bank accounts</div>
          <div className="max-h-40 space-y-1 overflow-y-auto text-xs">
            {(bankAccountsQuery.data?.accounts ?? []).map((a) => {
              const checked = accountPick.includes(a.id);
              return (
                <label key={a.id} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setAccountPick((prev) => (checked ? prev.filter((x) => x !== a.id) : [...prev, a.id]))
                    }
                  />
                  <span className="truncate">
                    {a.institution_name ?? "Bank"} — {a.account_name ?? a.id.slice(0, 6)}
                  </span>
                </label>
              );
            })}
            {(bankAccountsQuery.data?.accounts ?? []).length === 0 ? (
              <p className="text-gray-500">No bank accounts.</p>
            ) : null}
          </div>
          <label className="block text-xs">
            From
            <input type="date" className="mt-0.5 w-full rounded border border-gray-300 px-1 py-1" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label className="block text-xs">
            To
            <input type="date" className="mt-0.5 w-full rounded border border-gray-300 px-1 py-1" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
          <label className="block text-xs">
            Amount min (USD)
            <input className="mt-0.5 w-full rounded border border-gray-300 px-1 py-1" value={amountMin} onChange={(e) => setAmountMin(e.target.value)} />
          </label>
          <label className="block text-xs">
            Amount max (USD)
            <input className="mt-0.5 w-full rounded border border-gray-300 px-1 py-1" value={amountMax} onChange={(e) => setAmountMax(e.target.value)} />
          </label>
          <label className="block text-xs">
            Search description
            <input className="mt-0.5 w-full rounded border border-gray-300 px-1 py-1" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <Button size="sm" variant="secondary" onClick={() => void uncQuery.refetch()}>
            Apply filters
          </Button>
        </aside>

        <main className="min-w-0 flex-1 space-y-2">
          {uncQuery.isError && !backendPending ? (
            <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800">Could not load uncategorized transactions.</div>
          ) : null}
          {bulkIds.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded border border-blue-200 bg-blue-50 p-2 text-xs">
              <span className="font-semibold">{bulkIds.length} selected</span>
              <Button size="sm" variant="secondary" onClick={() => void applyBulkSuggestions()}>
                Apply suggestion to all selected
              </Button>
              <SelectCombobox
                className="h-8 rounded border border-gray-300 px-2"
                value={batchCoaId}
                onChange={(e) => setBatchCoaId(e.target.value)}
              >
                <option value="">Batch COA…</option>
                {(coaQuery.data?.accounts ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.account_number} — {a.account_name}
                  </option>
                ))}
              </SelectCombobox>
              <Button
                size="sm"
                disabled={!batchCoaId}
                onClick={() => bulkMut.mutate({ ids: bulkIds, accountId: batchCoaId })}
              >
                Categorize all selected
              </Button>
              <button type="button" className="text-blue-700 underline" onClick={() => setBulkSelected({})}>
                Clear selection
              </button>
            </div>
          ) : null}
          <div className="overflow-auto rounded border border-gray-200 bg-white">
            <table className="min-w-full text-left text-xs">
              <thead className="border-b border-gray-200 bg-gray-50 text-[11px] font-semibold uppercase text-gray-600">
                <tr>
                  <th className="px-2 py-2"> </th>
                  <th className="px-2 py-2">Date</th>
                  <th className="px-2 py-2">Account</th>
                  <th className="px-2 py-2">Description</th>
                  <th className="px-2 py-2 text-right">Amount</th>
                  <th className="px-2 py-2">Suggested</th>
                  <th className="px-2 py-2">Quick actions</th>
                </tr>
              </thead>
              <tbody>
                {txs.map((tx, idx) => {
                  const id = String(tx.id ?? "");
                  const suggs = suggestionQueries[idx]?.data?.suggestions ?? [];
                  const top = suggs[0] as Record<string, unknown> | undefined;
                  const selected = selectedRowId === id;
                  return (
                    <tr
                      key={id || idx}
                      className={`cursor-pointer border-b border-gray-100 ${selected ? "bg-blue-50" : "hover:bg-gray-50"}`}
                      onClick={() => setSelectedRowId(id)}
                    >
                      <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={Boolean(bulkSelected[id])} onChange={() => toggleBulk(id)} />
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-gray-800">{txDate(tx) || "—"}</td>
                      <td className="px-2 py-1.5 text-gray-700">{txBankLabel(tx)}</td>
                      <td className="max-w-[200px] truncate px-2 py-1.5 text-gray-800">{txDescription(tx)}</td>
                      <td className="px-2 py-1.5 text-right font-medium">{formatMoneyCents(txAmountCents(tx))}</td>
                      <td className="px-2 py-1.5 align-top text-gray-700">
                        <div className="space-y-0.5">
                          {suggs.slice(0, 3).map((s) => {
                            const rec = s as Record<string, unknown>;
                            const conf = suggestionConfidence(rec);
                            return (
                              <div key={String(rec.id ?? suggestionLabel(rec))} className="truncate text-[11px]">
                                {suggestionLabel(rec)}
                                {conf != null ? ` (${conf}%)` : ""}
                              </div>
                            );
                          })}
                          {suggs.length === 0 && !backendPending ? <span className="text-gray-400">…</span> : null}
                        </div>
                        {top ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="mt-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              void applySuggestion(id, top);
                            }}
                          >
                            Apply suggestion
                          </Button>
                        ) : null}
                      </td>
                      <td className="px-2 py-1.5 align-top" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-col gap-1">
                          <div className="flex flex-wrap gap-1">
                            <SelectCombobox
                              className="h-8 max-w-[140px] rounded border border-gray-300 px-1 text-[11px]"
                              value={coaPickByTx[id] ?? ""}
                              onChange={(e) => setCoaPickByTx((p) => ({ ...p, [id]: e.target.value }))}
                            >
                              <option value="">Categorize as…</option>
                              {(coaQuery.data?.accounts ?? []).map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.account_number}
                                </option>
                              ))}
                            </SelectCombobox>
                            <Button
                              size="sm"
                              disabled={!coaPickByTx[id]}
                              onClick={() => categorizeMut.mutate({ txId: id, accountId: coaPickByTx[id]! })}
                            >
                              Apply
                            </Button>
                          </div>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setManualPrefill({
                                date: txDate(tx) || undefined,
                                memo: `Bank tx ${id}: ${txDescription(tx)}`,
                              });
                              setManualJeOpen(true);
                            }}
                          >
                            Create manual JE
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setTransferLinkId(id);
                              const cents = Math.abs(txAmountCents(tx));
                              setTransferPrefill({
                                from_account_id: String(tx.bank_account_id ?? tx.plaid_bank_account_id ?? ""),
                                amount_cents: cents > 0 ? cents : undefined,
                                transfer_date: txDate(tx) || undefined,
                                memo: txDescription(tx),
                              });
                              setTransferOpen(true);
                            }}
                          >
                            Mark as transfer
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setSkipTx(tx);
                              setSkipNote("");
                            }}
                          >
                            Skip / investigate
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {txs.length === 0 && !uncQuery.isLoading && !backendPending ? (
              <div className="p-4 text-sm text-gray-600">No uncategorized transactions for these filters.</div>
            ) : null}
            {uncQuery.isLoading ? <div className="p-4 text-sm text-gray-500">Loading…</div> : null}
          </div>
        </main>

        <aside className="shrink-0 space-y-2 rounded border border-gray-200 bg-white p-3 lg:w-72">
          <div className="text-xs font-semibold text-gray-800">Selected transaction</div>
          {!selectedTx ? <p className="text-xs text-gray-500">Select a row.</p> : null}
          {selectedTx ? (
            <div className="space-y-1 text-xs text-gray-800">
              <div>
                <span className="font-semibold">Date:</span> {txDate(selectedTx)}
              </div>
              <div>
                <span className="font-semibold">Account:</span> {txBankLabel(selectedTx)}
              </div>
              <div>
                <span className="font-semibold">Amount:</span> {formatMoneyCents(txAmountCents(selectedTx))}
              </div>
              <div>
                <span className="font-semibold">Description:</span> {txDescription(selectedTx)}
              </div>
              <div className="pt-2 text-[11px] text-gray-600">
                {(
                  suggestionQueries[txs.findIndex((t) => String(t.id) === String(selectedTx.id))]?.data?.suggestions ?? []
                )
                  .slice(0, 3)
                  .map((s) => {
                    const rec = s as Record<string, unknown>;
                    return (
                      <div key={String(rec.id ?? suggestionLabel(rec))}>
                        {suggestionLabel(rec)} {suggestionConfidence(rec) != null ? `· ${suggestionConfidence(rec)}%` : ""}
                      </div>
                    );
                  })}
              </div>
            </div>
          ) : null}
        </aside>
      </div>

      <ManualJEModal
        open={manualJeOpen}
        operatingCompanyId={companyId}
        prefill={manualPrefill}
        onClose={() => {
          setManualJeOpen(false);
          setManualPrefill(null);
        }}
        onSaved={() => {
          invalidateBanking();
          void uncQuery.refetch();
        }}
      />
      <TransferModal
        open={transferOpen}
        operatingCompanyId={companyId}
        prefill={transferPrefill}
        linkBankTransactionId={transferLinkId}
        onClose={() => {
          setTransferOpen(false);
          setTransferPrefill(null);
          setTransferLinkId(null);
        }}
        onSaved={() => {
          invalidateBanking();
          void uncQuery.refetch();
          setTransferLinkId(null);
        }}
      />
      <Modal open={Boolean(skipTx)} onClose={() => setSkipTx(null)} title="Skip / investigate">
        <div className="space-y-2 text-xs">
          <label className="block">
            Note
            <textarea className="mt-1 w-full rounded border border-gray-300 p-2" value={skipNote} onChange={(e) => setSkipNote(e.target.value)} rows={4} />
          </label>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => setSkipTx(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!skipNote.trim() || !skipTx?.id}
              loading={skipMut.isPending}
              onClick={() => skipTx?.id && skipMut.mutate({ txId: String(skipTx.id), note: skipNote.trim() })}
            >
              Save flag
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
