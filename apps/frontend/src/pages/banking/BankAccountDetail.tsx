import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import {
  disconnectPlaidBankAccount,
  getPlaidBankAccount,
  getPlaidBankTransactions,
  syncPlaidBankAccount,
} from "../../api/banking";
import { useAuth } from "../../auth/useAuth";
import { PageHeader } from "../../components/layout/PageHeader";
import { ActionButton } from "../../components/shared/ActionButton";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";

const PAGE_SIZE = 50;

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

function syncStatusClasses(status: string) {
  if (status === "active") return "bg-green-100 text-green-700";
  if (status === "pending") return "bg-gray-100 text-gray-700";
  if (status === "needs_reauth") return "bg-amber-100 text-amber-700";
  if (status === "error") return "bg-red-100 text-red-700";
  if (status === "disconnected") return "bg-gray-200 text-gray-600 line-through";
  return "bg-gray-100 text-gray-700";
}

export function BankAccountDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const auth = useAuth();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [offset, setOffset] = useState(0);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const canSync = auth.user?.role === "Owner" || auth.user?.role === "Administrator";
  const canDisconnect = auth.user?.role === "Owner";

  const detailQuery = useQuery({
    queryKey: ["banking", "plaid-account-detail", id, companyId],
    queryFn: () => getPlaidBankAccount(id, companyId),
    enabled: Boolean(id && companyId),
  });
  const transactionsQuery = useQuery({
    queryKey: ["banking", "plaid-account-transactions", id, companyId, offset, startDate, endDate],
    queryFn: () =>
      getPlaidBankTransactions(id, companyId, {
        limit: PAGE_SIZE,
        offset,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }),
    enabled: Boolean(id && companyId),
  });

  const transactions = transactionsQuery.data?.transactions ?? [];
  const hasNextPage = transactions.length === PAGE_SIZE;
  const account = detailQuery.data?.account;

  const headerTitle = useMemo(() => {
    if (!account) return "Bank Account";
    return `${account.institution_name || "Bank"} - ${account.account_name || "Account"}`;
  }, [account]);

  return (
    <div className="space-y-4">
      <PageHeader
        backHref="/banking"
        title={headerTitle}
        subtitle={account?.account_mask ? `••••${account.account_mask}` : ""}
        actions={
          <div className="flex items-center gap-3">
            {canSync ? (
              <ActionButton
                disabled={syncing || !account?.is_active}
                onClick={() => {
                  if (!id) return;
                  setSyncing(true);
                  void syncPlaidBankAccount(id)
                    .then((res) => {
                      pushToast(`Sync complete: +${res.added} / ~${res.modified} / -${res.removed}`, "success");
                      return Promise.all([
                        queryClient.invalidateQueries({ queryKey: ["banking", "plaid-account-detail", id, companyId] }),
                        queryClient.invalidateQueries({ queryKey: ["banking", "plaid-account-transactions", id] }),
                        queryClient.invalidateQueries({ queryKey: ["banking", "plaid-accounts"] }),
                      ]);
                    })
                    .catch((error) => pushToast(String((error as Error).message || "Sync failed"), "error"))
                    .finally(() => setSyncing(false));
                }}
              >
                {syncing ? "Syncing..." : "Sync Now"}
              </ActionButton>
            ) : null}
            {canDisconnect ? (
              <ActionButton
                disabled={disconnecting || !account?.is_active}
                className="text-red-700"
                onClick={() => {
                  if (!id || !companyId) return;
                  setDisconnecting(true);
                  void disconnectPlaidBankAccount(id, companyId)
                    .then(() => {
                      pushToast("Bank account disconnected", "success");
                      navigate("/banking");
                    })
                    .catch((error) => pushToast(String((error as Error).message || "Disconnect failed"), "error"))
                    .finally(() => setDisconnecting(false));
                }}
              >
                {disconnecting ? "Disconnecting..." : "Disconnect"}
              </ActionButton>
            ) : null}
          </div>
        }
      />

      {detailQuery.isError || transactionsQuery.isError ? (
        <ListErrorBanner
          onRetry={() => {
            void detailQuery.refetch();
            void transactionsQuery.refetch();
          }}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-3 rounded border border-gray-200 bg-white p-4 md:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Current balance</p>
          <p className="text-xl font-semibold text-gray-900">{money(Number(account?.current_balance_cents ?? 0))}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Available balance</p>
          <p className="text-xl font-semibold text-gray-900">{money(Number(account?.available_balance_cents ?? 0))}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Sync status</p>
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${syncStatusClasses(account?.sync_status ?? "pending")}`}>
            {account?.sync_status ?? "pending"}
          </span>
          <p className="mt-1 text-xs text-gray-500">
            {account?.last_synced_at ? `Last synced ${new Date(account.last_synced_at).toLocaleString()}` : "No sync recorded"}
          </p>
        </div>
      </div>

      <div className="rounded border border-gray-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-600">Start date</label>
            <input
              type="date"
              value={startDate}
              onChange={(event) => {
                setOffset(0);
                setStartDate(event.target.value);
              }}
              className="rounded border border-gray-300 px-2 py-1 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-600">End date</label>
            <input
              type="date"
              value={endDate}
              onChange={(event) => {
                setOffset(0);
                setEndDate(event.target.value);
              }}
              className="rounded border border-gray-300 px-2 py-1 text-sm"
            />
          </div>
          <ActionButton
            onClick={() => {
              setOffset(0);
              void transactionsQuery.refetch();
            }}
          >
            Apply Filter
          </ActionButton>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="border-b border-gray-200 px-2 py-2">Date</th>
                <th className="border-b border-gray-200 px-2 py-2">Description</th>
                <th className="border-b border-gray-200 px-2 py-2">Amount</th>
                <th className="border-b border-gray-200 px-2 py-2">Category</th>
                <th className="border-b border-gray-200 px-2 py-2">Matched</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((row) => (
                <tr key={row.id} className="align-top">
                  <td className="border-b border-gray-100 px-2 py-2 text-gray-700">{row.transaction_date}</td>
                  <td className="border-b border-gray-100 px-2 py-2 text-gray-700">
                    <div className="font-medium text-gray-900">{row.description || "Bank transaction"}</div>
                    {row.merchant_name ? <div className="text-xs text-gray-500">{row.merchant_name}</div> : null}
                  </td>
                  <td className="border-b border-gray-100 px-2 py-2 text-gray-700">{money(Number(row.amount_cents))}</td>
                  <td className="border-b border-gray-100 px-2 py-2 text-gray-700">
                    {Array.isArray(row.plaid_category) && row.plaid_category.length > 0 ? row.plaid_category.join(" / ") : "Uncategorized"}
                  </td>
                  <td className="border-b border-gray-100 px-2 py-2 text-gray-700">
                    {row.matched_load_id || row.matched_bill_id || row.matched_settlement_id ? "Yes" : "No"}
                  </td>
                </tr>
              ))}
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-2 py-4 text-center text-sm text-gray-500">
                    No transactions found for this filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-end gap-2">
          <ActionButton
            disabled={offset === 0}
            onClick={() => {
              setOffset((current) => Math.max(0, current - PAGE_SIZE));
            }}
          >
            Previous
          </ActionButton>
          <ActionButton
            disabled={!hasNextPage}
            onClick={() => {
              setOffset((current) => current + PAGE_SIZE);
            }}
          >
            Next
          </ActionButton>
        </div>
      </div>
    </div>
  );
}

