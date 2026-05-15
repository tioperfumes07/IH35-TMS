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
import { useAuth } from "../../../auth/useAuth";
import { PlaidReconnectButton, plaidItemBadgeClasses, plaidItemBadgeLabel } from "./PlaidReconnectButton";
import { ActionButton } from "../../../components/shared/ActionButton";
import { useToast } from "../../../components/Toast";
import { Link } from "react-router-dom";

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
  const v = (sign * cents) / 100;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

function categoryLabel(t: PlaidBankTransaction) {
  const c = t.plaid_category ?? [];
  return c.length ? c.join(" / ") : "—";
}

function matchedLabel(t: PlaidBankTransaction) {
  if (t.matched_kind === "load" && t.matched_load_id) return `Load ${t.matched_load_id.slice(0, 8)}…`;
  if (t.matched_kind === "settlement" && t.matched_settlement_id) return `Settlement ${t.matched_settlement_id.slice(0, 8)}…`;
  if (t.matched_kind === "bill" && t.matched_bill_id) return `Bill ${t.matched_bill_id.slice(0, 8)}…`;
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
  const plaidQuery = useQuery({
    queryKey: ["banking", "plaid-accounts", companyId],
    queryFn: () => getPlaidBankAccounts(companyId),
    enabled: Boolean(companyId),
  });

  const groups = useMemo(() => groupByPlaidItem(plaidQuery.data?.accounts ?? []), [plaidQuery.data?.accounts]);

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
    <div className="rounded border border-gray-200 bg-white p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">Plaid connections</div>
      {plaidQuery.isError ? <ListErrorBanner onRetry={() => void plaidQuery.refetch()} /> : null}
      {plaidQuery.isLoading ? <p className="text-sm text-gray-600">Loading connections…</p> : null}
      {!plaidQuery.isLoading && groups.length === 0 ? (
        <p className="text-sm text-gray-600">No bank accounts connected yet. Use <span className="font-medium">Connect Bank</span> above.</p>
      ) : null}
      <div className="space-y-3">
        {groups.map((g) => {
          const lead = g.accounts[0]!;
          const institution = lead.institution_name || "Institution";
          const itemId = g.itemId.startsWith("noid:") ? null : g.itemId;
          const lastSync = g.accounts
            .map((a) => (a.last_synced_at ? new Date(a.last_synced_at).getTime() : 0))
            .reduce((a, b) => Math.max(a, b), 0);
          const badgeLabel = plaidItemBadgeLabel(g.accounts);
          const badgeClass = plaidItemBadgeClasses(g.accounts);
          return (
            <div key={g.itemId} className="rounded border border-gray-100 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 gap-2">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded bg-gray-100 text-xs font-bold text-gray-700" aria-hidden>
                    {institution.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{institution}</p>
                    <p className="text-xs text-gray-600">
                      Accounts:{" "}
                      {g.accounts.map((a) => (
                        <span key={a.id} className="mr-2 inline-block">
                          <Link className="text-blue-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" to={`/banking/accounts/${a.id}`}>
                            {(a.account_name || "Account") + (a.account_mask ? ` ••••${a.account_mask}` : "")}
                          </Link>
                        </span>
                      ))}
                    </p>
                    <p className="text-xs text-gray-500">
                      Last sync: {lastSync ? new Date(lastSync).toLocaleString() : "—"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeClass}`}>{badgeLabel}</span>
                  {canConnect && itemId ? (
                    <div className="flex flex-wrap justify-end gap-2">
                      <div
                        className={
                          reconnectHighlightItemId === itemId
                            ? "rounded-md p-0.5 ring-2 ring-amber-400 ring-offset-1"
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
                      <ActionButton
                        type="button"
                        className="border border-blue-200 bg-blue-50 text-blue-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                        disabled={syncingItemId === itemId}
                        onClick={() => void handleManualPlaidSync(itemId, institution)}
                      >
                        {syncingItemId === itemId ? "Syncing…" : "Sync now"}
                      </ActionButton>
                      {canDisconnect ? (
                        <ActionButton
                          type="button"
                          className="border border-red-200 bg-red-50 text-red-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                          onClick={() => {
                            if (!window.confirm("Disconnect this bank item and deactivate its accounts locally?")) return;
                            void disconnectPlaidItem(companyId, itemId)
                              .then(() => {
                                pushToast("Item disconnected", "success");
                                void queryClient.invalidateQueries({ queryKey: ["banking"] });
                              })
                              .catch((e: unknown) => pushToast(String((e as Error).message || "Disconnect failed"), "error"));
                          }}
                        >
                          Disconnect
                        </ActionButton>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {!canConnect ? <p className="mt-2 text-xs text-gray-500">Connect and reconnect actions are limited to Owner/Admin.</p> : null}
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

  const accounts = accountsQuery.data?.accounts ?? [];
  const rows = txQuery.data?.transactions ?? [];

  if (!companyId) return null;

  const thBtn = (key: CompanyTransactionsSort, label: string) => (
    <button
      type="button"
      className="font-semibold text-gray-700 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
      onClick={() => setSort(key)}
      aria-pressed={sort === key}
    >
      {label}
      {sort === key ? " *" : ""}
    </button>
  );

  return (
    <div className="rounded border border-gray-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Bank transactions</h2>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search description"
          aria-label="Filter transactions by description"
          className="min-w-[12rem] flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        />
        <select
          value={accountFilter}
          onChange={(e) => setAccountFilter(e.target.value)}
          aria-label="Filter by account"
          className="rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          <option value="">All accounts</option>
          {accounts.map((a: PlaidBankAccount) => (
            <option key={a.id} value={a.id}>
              {(a.institution_name || "Bank") + " — " + (a.account_name || "Account")}
            </option>
          ))}
        </select>
      </div>
      {txQuery.isError ? <p className="text-sm text-red-600">Unable to load transactions.</p> : null}
      {txQuery.isLoading ? <p className="text-sm text-gray-600">Loading…</p> : null}
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <caption className="sr-only">Company bank transactions</caption>
          <thead>
            <tr className="border-b border-gray-200 text-xs uppercase text-gray-500">
              <th scope="col" className="py-2 pr-3">
                {thBtn("date_desc", "Date")}
              </th>
              <th scope="col" className="py-2 pr-3">
                Description
              </th>
              <th scope="col" className="py-2 pr-3">
                {thBtn("amount_desc", "Amount")}
              </th>
              <th scope="col" className="py-2 pr-3">
                Account
              </th>
              <th scope="col" className="py-2 pr-3">
                Category
              </th>
              <th scope="col" className="py-2 pr-3">
                Matched to
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t: PlaidBankTransaction) => (
              <tr key={t.id} className="border-b border-gray-100">
                <td className="py-2 pr-3 whitespace-nowrap text-gray-800">{t.transaction_date}</td>
                <td className="py-2 pr-3 text-gray-800">{t.description || t.merchant_name || "—"}</td>
                <td className="py-2 pr-3 font-medium text-gray-900">{formatMoney(t.amount_cents, t.is_credit)}</td>
                <td className="py-2 pr-3 text-gray-700">
                  {(t.institution_name || "") + (t.account_mask ? ` ••••${t.account_mask}` : "")}
                </td>
                <td className="py-2 pr-3 text-gray-700">{categoryLabel(t)}</td>
                <td className="py-2 pr-3 text-gray-700">{matchedLabel(t)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!txQuery.isLoading && rows.length === 0 ? <p className="mt-2 text-sm text-gray-600">No transactions found.</p> : null}
    </div>
  );
}
