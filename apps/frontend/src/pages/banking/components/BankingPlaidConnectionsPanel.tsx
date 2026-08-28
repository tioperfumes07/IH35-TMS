import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  disconnectPlaidItem,
  getPlaidBankAccounts,
  getPlaidCompanyTransactions,
  syncPlaidItem,
  type CompanyTransactionsSort,
  type PlaidBankAccount,
  type PlaidBankTransaction,
} from "../../../api/banking";
import { ApiError } from "../../../api/client";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { ConfirmModal } from "../../../components/shared/ConfirmModal";
import { useAuth } from "../../../auth/useAuth";
import { PlaidReconnectButton } from "./PlaidReconnectButton";
import { PlaidItemCard } from "./PlaidItemCard";
import { derivePlaidConnectionBadgeLabel } from "./plaid-item-display";
import { ActionButton } from "../../../components/shared/ActionButton";
import { useToast } from "../../../components/Toast";
import { EntityLink } from "../../../components/shared/EntityLink";
import { filterPlaidBankAccountsForCompany } from "../../../lib/banking-company-filter";
import { entityLabel, visibleDocumentLabel } from "../../../lib/entity-label";
import { Link } from "react-router-dom";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { useListState } from "../../../components/list-state";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { formatUsdCents } from "../../../lib/money";
import { formatDateUS } from "../../../lib/formatDate";

type ItemGroup = { itemId: string; accounts: PlaidBankAccount[] };

function groupByPlaidItem(accounts: PlaidBankAccount[]): ItemGroup[] {
  const map = new Map<string, PlaidBankAccount[]>();
  for (const a of accounts) {
    const key = a.plaid_item_id && a.plaid_item_id.trim().length > 0 ? a.plaid_item_id : `noid:${a.id}`;
    const list = map.get(key) ?? [];
    list.push(a);
    map.set(key, list);
  }
  return [...map.entries()].map(([itemId, acc]) => ({ itemId, accounts: acc }));
}

function formatMoney(cents: number, isCredit: boolean) {
  const sign = isCredit ? 1 : -1;
  return formatUsdCents(sign * cents);
}

function categoryLabel(t: PlaidBankTransaction) {
  const c = t.plaid_category ?? [];
  return c.length ? c.join(" / ") : "—";
}

function matchedLabel(t: PlaidBankTransaction) {
  const links = [
    t.matched_transfer_id ? <EntityLink key="transfer" kind="transfer" id={t.matched_transfer_id} label={entityLabel(t.matched_transfer_label, t.matched_transfer_id, "Transfer")} /> : null,
    t.matched_journal_entry_id ? <EntityLink key="je" kind="journal_entry" id={t.matched_journal_entry_id} label={entityLabel(t.matched_journal_entry_memo, t.matched_journal_entry_id, "Journal entry")} /> : null,
    t.matched_expense_id ? <EntityLink key="expense" kind="expense" id={t.matched_expense_id} label={visibleDocumentLabel(t.matched_expense_number, t.matched_expense_id, "Expense")} /> : null,
    t.matched_load_id ? <EntityLink key="load" kind="load" id={t.matched_load_id} label={entityLabel(t.matched_load_number, t.matched_load_id, "Load")} /> : null,
    t.matched_settlement_id ? <EntityLink key="settlement" kind="settlement" id={t.matched_settlement_id} label={entityLabel(t.matched_settlement_display_id, t.matched_settlement_id, "Settlement")} /> : null,
    t.matched_bill_id ? <EntityLink key="bill" kind="bill" id={t.matched_bill_id} label={visibleDocumentLabel(t.matched_bill_number, t.matched_bill_id, "Bill")} /> : null,
  ].filter(Boolean);
  if (links.length) return <div className="flex flex-wrap gap-1">{links}</div>;
  return "Unmatched";
}

function extractApiErrorMessage(err: ApiError): string {
  const d = err.data;
  if (d && typeof d === "object") {
    const o = d as Record<string, unknown>;
    if (typeof o.message === "string") return o.message;
    if (typeof o.error === "string") return o.error;
  }
  return err.message;
}

export function BankingPlaidConnectionsPanel({
  companyId,
}: {
  companyId: string;
}) {
  const queryClient = useQueryClient();
  const auth = useAuth();
  const { pushToast } = useToast();
  const [syncingItemId, setSyncingItemId] = useState<string | null>(null);
  const [reconnectHighlightItemId, setReconnectHighlightItemId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  // NO-NATIVE-DIALOGS-U6 — window.confirm freezes Live Chrome browser automation; ConfirmModal
  // (in-app yes/no shell) replaces it, same disconnect contract.
  const [disconnectTarget, setDisconnectTarget] = useState<string | null>(null);
  const plaidQuery = useQuery({
    queryKey: ["banking", "plaid-accounts", companyId],
    queryFn: () => getPlaidBankAccounts(companyId),
    enabled: Boolean(companyId),
  });

  const filteredSource = useMemo(
    () => filterPlaidBankAccountsForCompany(plaidQuery.data?.accounts ?? [], companyId),
    [plaidQuery.data?.accounts, companyId]
  );

  // BANK-PLAID-CHROME — this panel manages Plaid-linked bank feeds specifically (Reconnect / Sync
  // now / Disconnect), so it must only ever list accounts that actually went through Plaid. An
  // account with no plaid_item_id (e.g. the Relay Fuel Wallet, a non-Plaid internal wallet synced
  // by a different mechanism, sync_status='active') was previously falling into groupByPlaidItem's
  // `noid:` fallback bucket and rendering here as a connection: generic "Institution" name, a
  // permanently red "Never synced" badge (derivePlaidConnectionBadgeLabel has no other status for
  // last_synced_at=null), and — because itemId is null for a noid group — NO reconnect/sync action
  // at all. That combination reads as a broken bank feed with no way to fix it, for an account that
  // was never Plaid-connected in the first place. Excluding non-Plaid accounts here leaves them
  // correctly visible everywhere else (Accounts tab, account tiles, transactions) unaffected.
  const plaidLinkedSource = useMemo(
    () => filteredSource.filter((a) => Boolean(a.plaid_item_id && a.plaid_item_id.trim().length > 0)),
    [filteredSource]
  );

  const groups = useMemo(() => groupByPlaidItem(plaidLinkedSource), [plaidLinkedSource]);
  const visibleGroups = useMemo(() => {
    if (showInactive) return groups;
    return groups.filter((g) => g.accounts.some((a) => a.is_active));
  }, [groups, showInactive]);
  // The no-connections empty message renders only once the accounts query settles, never mid-fetch.
  const plaidListState = useListState(plaidQuery, groups.length === 0);

  const canConnect = auth.user?.role === "Owner" || auth.user?.role === "Administrator";
  const canDisconnect = auth.user?.role === "Owner";

  async function handleManualPlaidSync(plaidItemId: string, institutionLabel: string) {
    setSyncingItemId(plaidItemId);
    try {
      let added = 0;
      let modified = 0;
      let removed = 0;
      for (let i = 0; i < 10; i++) {
        const res = await syncPlaidItem(companyId, plaidItemId);
        added += res.added;
        modified += res.modified;
        removed += res.removed;
        if (!res.has_more) break;
      }

      setReconnectHighlightItemId(null);
      pushToast(`Synced ${institutionLabel}: +${added} new, ~${modified} changed, -${removed} removed`, "success");
      await queryClient.invalidateQueries({ queryKey: ["banking"] });
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        if (e.status === 409) {
          pushToast(`Reconnect required for ${institutionLabel}`, "info");
          setReconnectHighlightItemId(plaidItemId);
        } else {
          pushToast(extractApiErrorMessage(e), "error");
        }
      } else {
        pushToast(String((e as Error).message || "Sync failed"), "error");
      }
    } finally {
      setSyncingItemId(null);
    }
  }

  if (!companyId) return null;

  return (
    <div className="rounded-sm border border-gray-200 bg-white p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">Plaid connections</div>
      {plaidQuery.isError ? <ListErrorBanner onRetry={() => void plaidQuery.refetch()} /> : null}
      {plaidQuery.isLoading ? <p className="text-sm text-gray-600">Loading connections…</p> : null}
      {!plaidQuery.isLoading && groups.length > 0 && visibleGroups.length === 0 ? (
        <p className="text-sm text-gray-600">No active Plaid connections for this company filter. Enable history below.</p>
      ) : null}
      {plaidListState.isEmpty ? (
        <p className="text-sm text-gray-600">No bank accounts connected yet. Use <span className="font-medium">Connect Bank</span> above.</p>
      ) : null}
      <div className="space-y-3">
        {visibleGroups.map((g) => {
          const lead = g.accounts[0]!;
          const institution = lead.institution_name || "Institution";
          const itemId = g.itemId.startsWith("noid:") ? null : g.itemId;
          const needsReauth = g.accounts.some((a) => a.sync_status === "needs_reauth");
          const badgeLabel = derivePlaidConnectionBadgeLabel(g.accounts);
          const showReconnectCta = needsReauth || badgeLabel === "Never synced" || badgeLabel === "Out of sync";
          return (
            <div key={g.itemId} className="space-y-2">
              <PlaidItemCard
                institution={institution}
                accounts={g.accounts}
                actions={
                  canConnect && itemId ? (
                    <div className="flex flex-wrap justify-end gap-2">
                      <div className="flex flex-col items-end gap-1">
                        <div
                          className={
                            reconnectHighlightItemId === itemId
                              ? "rounded-md p-0.5 ring-2 ring-slate-400 ring-offset-1"
                              : ""
                          }
                        >
                          <PlaidReconnectButton
                            operatingCompanyId={companyId}
                            plaidItemId={itemId}
                            onComplete={() => {
                              setReconnectHighlightItemId(null);
                              void queryClient.invalidateQueries({ queryKey: ["banking"] });
                            }}
                          />
                        </div>
                      </div>
                      <ActionButton
                        type="button"
                        className="border border-slate-300 bg-slate-100 text-slate-700 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-slate-400"
                        disabled={syncingItemId === itemId}
                        onClick={() => void handleManualPlaidSync(itemId, institution)}
                      >
                        {syncingItemId === itemId ? "Syncing…" : "Sync now"}
                      </ActionButton>
                      {canDisconnect ? (
                        <ActionButton
                          type="button"
                          className="border border-red-200 bg-red-50 text-red-800 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-red-600"
                          onClick={() => setDisconnectTarget(itemId)}
                        >
                          Disconnect
                        </ActionButton>
                      ) : null}
                    </div>
                  ) : null
                }
              />
              <div className="rounded-sm border border-gray-100 px-3 pb-3 pt-0">
                <p className="text-xs text-gray-600">
                  Accounts:{" "}
                  {g.accounts.map((a) => (
                    <span key={a.id} className="mr-2 inline-block">
                      <Link className="text-slate-700 hover:underline focus:outline-hidden focus-visible:ring-2 focus-visible:ring-slate-400" to={`/banking/accounts/${a.id}`}>
                        {(a.account_name || "Account") + (a.account_mask ? ` ••••${a.account_mask}` : "")}
                      </Link>
                    </span>
                  ))}
                </p>
                {showReconnectCta && itemId ? (
                  <p className="mt-1 text-[10px] font-semibold uppercase text-slate-700">Reconnect needed</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-gray-600">
        <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
        Show disconnected history (include inactive)
      </label>
      {!canConnect ? <p className="mt-2 text-xs text-gray-500">Connect and reconnect actions are limited to Owner/Admin.</p> : null}
      <ConfirmModal
        open={Boolean(disconnectTarget)}
        title="Disconnect bank item"
        message="Disconnect this bank item and deactivate its accounts locally?"
        confirmLabel="Disconnect"
        danger
        onClose={() => setDisconnectTarget(null)}
        onConfirm={async () => {
          if (!disconnectTarget) return;
          try {
            await disconnectPlaidItem(companyId, disconnectTarget);
            pushToast("Item disconnected", "success");
            void queryClient.invalidateQueries({ queryKey: ["banking"] });
          } catch (e: unknown) {
            pushToast(String((e as Error).message || "Disconnect failed"), "error");
            throw e;
          }
        }}
      />
    </div>
  );
}

export function BankingCompanyTransactionsPanel({ companyId }: { companyId: string }) {
  const [q, setQ] = useState("");
  const [accountFilter, setAccountFilter] = useState<string>("");
  const [sort, setSort] = useState<CompanyTransactionsSort>("date_desc");

  const accountsQuery = useQuery({
    queryKey: ["banking", "plaid-accounts", companyId, "tx-filter"],
    queryFn: () => getPlaidBankAccounts(companyId),
    enabled: Boolean(companyId),
  });

  const txQuery = useQuery({
    queryKey: ["banking", "company-transactions", companyId, q, accountFilter, sort],
    queryFn: () =>
      getPlaidCompanyTransactions(companyId, {
        limit: 200,
        q: q.trim() || undefined,
        bank_account_id: accountFilter || undefined,
        sort,
      }),
    enabled: Boolean(companyId),
  });

  const accounts = useMemo(
    () => filterPlaidBankAccountsForCompany(accountsQuery.data?.accounts ?? [], companyId),
    [accountsQuery.data?.accounts, companyId]
  );
  const rows = txQuery.data?.transactions ?? [];
  // Empty message renders only once the transactions query settles, never mid-fetch.
  const txListState = useListState(txQuery, rows.length === 0);

  // Display-only ParityTable migration: column order, cell text, and the signed
  // formatMoney(amount_cents, is_credit) rendering are preserved 1:1 from the former
  // hand-rolled table markup. No posting/mutation logic — this list is read-only.
  const txColumns = useMemo<ParityColumn<PlaidBankTransaction>[]>(
    () => [
      {
        key: "transaction_date",
        label: "Date",
        sortable: true,
        cellClass: "whitespace-nowrap text-gray-800",
        render: (t) => formatDateUS(t.transaction_date),
      },
      {
        key: "description",
        label: "Description",
        cellClass: "text-gray-800",
        render: (t) => t.description || t.merchant_name || "—",
      },
      {
        key: "amount_cents",
        label: "Amount",
        sortable: true,
        // Server orders amount sorts by raw bt.amount_cents — mirror that, not the signed display value.
        sortValue: (t) => t.amount_cents,
        cellClass: "font-medium text-gray-900",
        render: (t) => formatMoney(t.amount_cents, t.is_credit),
      },
      {
        key: "account",
        label: "Account",
        cellClass: "text-gray-700",
        render: (t) => (t.institution_name || "") + (t.account_mask ? ` ••••${t.account_mask}` : ""),
      },
      {
        key: "category",
        label: "Category",
        cellClass: "text-gray-700",
        render: (t) => categoryLabel(t),
      },
      {
        key: "matched",
        label: "Matched to",
        cellClass: "text-gray-700",
        render: (t) => matchedLabel(t),
      },
    ],
    []
  );

  // Controlled sort — header clicks keep driving the SAME server-side sort param
  // (CompanyTransactionsSort in the existing query key); ParityTable only reflects it.
  const paritySortKey = sort === "amount_desc" || sort === "amount_asc" ? "amount_cents" : "transaction_date";
  const paritySortDirection: "asc" | "desc" = sort === "date_asc" || sort === "amount_asc" ? "asc" : "desc";

  if (!companyId) return null;

  const handleSortChange = (key: string, direction: "asc" | "desc") => {
    if (key === "transaction_date") setSort(direction === "asc" ? "date_asc" : "date_desc");
    else if (key === "amount_cents") setSort(direction === "asc" ? "amount_asc" : "amount_desc");
  };

  return (
    <div className="rounded-sm border border-gray-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Bank transactions</h2>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search description"
          aria-label="Filter transactions by description"
          className="min-w-48 flex-1 rounded-sm border border-gray-300 px-2 py-1 text-sm focus:outline-hidden focus-visible:ring-2 focus-visible:ring-slate-400"
        />
        <SelectCombobox
          value={accountFilter}
          onChange={(e) => setAccountFilter(e.target.value)}
          aria-label="Filter by account"
          className="rounded-sm border border-gray-300 px-2 py-1 text-sm focus:outline-hidden focus-visible:ring-2 focus-visible:ring-slate-400"
        >
          <option value="">All accounts</option>
          {accounts.map((a: PlaidBankAccount) => (
            <option key={a.id} value={a.id}>
              {(a.institution_name || "Bank") + " — " + (a.account_name || "Account")}
            </option>
          ))}
        </SelectCombobox>
      </div>
      {txQuery.isError ? <p className="text-sm text-red-600">Unable to load transactions.</p> : null}
      <ParityTable<PlaidBankTransaction>
        columns={txColumns}
        rows={rows}
        rowKey={(t) => t.id}
        loading={txListState.isLoading}
        emptyText={txListState.isEmpty ? "No transactions found." : undefined}
        storageKey="banking-company-transactions"
        tableTestId="banking-company-transactions-table"
        sortKey={paritySortKey}
        sortDirection={paritySortDirection}
        onSortChange={handleSortChange}
      />
    </div>
  );
}
