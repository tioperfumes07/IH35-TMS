import { useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import {
  disconnectPlaidBankAccount,
  getPlaidBankAccount,
  getPlaidBankAccounts,
  getPlaidBankTransactions,
  syncPlaidBankAccount,
} from "../../api/banking";
import { useAuth } from "../../auth/useAuth";
import { PageHeader } from "../../components/layout/PageHeader";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ActionButton } from "../../components/shared/ActionButton";
import { EntityLink } from "../../components/shared/EntityLink";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useListState } from "../../components/list-state";
import type { PlaidBankTransaction } from "../../api/banking";
import { formatUsdCents } from "../../lib/money";
import { BankingTransactionsDesignView, spentReceived } from "./components/BankingTransactionsDesignView";

const PAGE_SIZE = 50;

/** Signed QBO amount — direction from is_credit (same spentReceived convention as the live register). */
export function formatBankTransactionSignedAmount(tx: Pick<PlaidBankTransaction, "amount_cents" | "is_credit">) {
  const { spent, received } = spentReceived(tx as PlaidBankTransaction);
  return received > 0 ? formatUsdCents(received) : formatUsdCents(-spent);
}

function syncStatusClasses(status: string) {
  if (status === "active") return "bg-slate-100 text-slate-700";
  if (status === "pending") return "bg-gray-100 text-gray-700";
  if (status === "needs_reauth") return "bg-slate-100 text-slate-700";
  if (status === "error") return "bg-red-100 text-red-700";
  if (status === "disconnected") return "bg-gray-200 text-gray-600 line-through";
  return "bg-gray-100 text-gray-700";
}

// KEYSTONE (Doc-18 defects 2,3,4,5,6,8) — clicking a bank account on Banking Home lands the operator on
// the SAME categorize-capable register as the Transactions tab, not the old read-only table. We mount
// the single live transaction surface (BankingTransactionsDesignView) pre-filtered to this account, so the
// operator gets the full power (categorize / post / match / split, tab strip, From/To column, resizable,
// responsive) instead of an inert grid whose rows had no onClick. The route (/banking/accounts/:id) and the
// account header + balance KPIs + Sync/Disconnect actions are preserved (additive). The prior inert table is
// ARCHIVED below (ArchivedBankAccountDetailTable) — kept importable, clearly retired, never mounted.
export function BankAccountDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const auth = useAuth();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const canSync = auth.user?.role === "Owner" || auth.user?.role === "Administrator";
  const canDisconnect = auth.user?.role === "Owner";

  const detailQuery = useQuery({
    queryKey: ["banking", "plaid-account-detail", id, companyId],
    queryFn: () => getPlaidBankAccount(id, companyId),
    enabled: Boolean(id && companyId),
  });
  // Full account roster for the register's account chip strip (so the operator can pivot to another
  // account without leaving the register), same source BankingHome feeds the Transactions tab.
  const accountsQuery = useQuery({
    queryKey: ["banking", "plaid-accounts", companyId],
    queryFn: () => getPlaidBankAccounts(companyId),
    enabled: Boolean(companyId),
  });

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
                        queryClient.invalidateQueries({ queryKey: ["banking"] }),
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

      {detailQuery.isError || accountsQuery.isError ? (
        <ListErrorBanner
          onRetry={() => {
            void detailQuery.refetch();
            void accountsQuery.refetch();
          }}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-3 rounded-sm border border-gray-200 bg-white p-4 md:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Current balance</p>
          <p className="text-xl font-semibold text-gray-900">{formatUsdCents(account?.current_balance_cents ?? 0)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Available balance</p>
          <p className="text-xl font-semibold text-gray-900">{formatUsdCents(account?.available_balance_cents ?? 0)}</p>
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

      {/* KEYSTONE — the categorize-capable register (single live transaction surface), pre-filtered to this
      account. Selecting another account chip keeps the URL in sync via onSelectAccount → navigate. */}
      <BankingTransactionsDesignView
        companyId={companyId}
        accounts={accountsQuery.data?.accounts ?? []}
        selectedAccountId={id}
        onSelectAccount={(accountId) => navigate(`/banking/accounts/${accountId}`)}
        onManageConnections={() => navigate("/banking")}
        onDataChanged={() => {
          void queryClient.invalidateQueries({ queryKey: ["banking"] });
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// @archived — the original read-only bank-account transactions table (Doc-18 BAD surface): a plain hand-rolled
// table (since re-rendered via the shared ParityTable, display-only, verify-step 1163)
// whose rows had no onClick and no categorize/post/match/split, a box-in-box calendar, no tab strip, no
// From/To column, not resizable. SUPERSEDED by BankingTransactionsDesignView, now mounted by
// BankAccountDetailPage above. Kept importable for audit history; NEVER re-wire this into a route. Enforced
// by scripts/verify-banking-register-categorize-capable.mjs (asserts the route mounts the design view and
// only ONE live categorize table exists). The date pickers below were made borderless so no box-in-box
// residue survives even in the archived source (Doc-18 defect #3).
// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Display-only ParityTable migration (verify-step 1163): column order (Date / Description / Amount /
// Category / Matched), the is_credit-aware signed amount rendering (formatBankTransactionSignedAmount),
// the EntityLink Matched cells, the settled-only empty literal, and the server-side offset pager are all
// preserved 1:1 from the former hand-rolled markup. No handlers changed; this archived surface posts nothing.
const ARCHIVED_TX_COLUMNS: ParityColumn<PlaidBankTransaction>[] = [
  {
    key: "transaction_date",
    label: "Date",
    render: (row) => <span className="text-gray-700">{row.transaction_date}</span>,
  },
  {
    key: "description",
    label: "Description",
    render: (row) => (
      <>
        <div className="font-medium text-gray-900">{row.description || "Bank transaction"}</div>
        {row.merchant_name ? <div className="text-xs text-gray-500">{row.merchant_name}</div> : null}
      </>
    ),
  },
  {
    key: "amount_cents",
    label: "Amount",
    render: (row) => <span className="text-gray-700">{formatBankTransactionSignedAmount(row)}</span>,
  },
  {
    key: "plaid_category",
    label: "Category",
    render: (row) => (
      <span className="text-gray-700">
        {Array.isArray(row.plaid_category) && row.plaid_category.length > 0 ? row.plaid_category.join(" / ") : "Uncategorized"}
      </span>
    ),
  },
  {
    key: "matched",
    label: "Matched",
    render: (row) =>
      row.matched_load_id ? (
        <EntityLink kind="load" id={row.matched_load_id} label="Load" />
      ) : row.matched_bill_id ? (
        <EntityLink kind="bill" id={row.matched_bill_id} label="Bill" />
      ) : row.matched_settlement_id ? (
        <EntityLink kind="settlement" id={row.matched_settlement_id} label="Settlement" />
      ) : (
        "No"
      ),
  },
];

export function ArchivedBankAccountDetailTable() {
  const { id = "" } = useParams<{ id: string }>();
  const { pushToast: _pushToast } = useToast();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [offset, setOffset] = useState(0);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  void _pushToast;

  const transactionsQuery = useQuery({
    queryKey: ["banking", "plaid-account-transactions", id, companyId, offset, startDate, endDate],
    queryFn: () =>
      getPlaidBankTransactions(id, companyId, {
        limit: PAGE_SIZE,
        offset,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }),
    enabled: false,
  });

  const transactions = transactionsQuery.data?.transactions ?? [];
  const hasNextPage = transactions.length === PAGE_SIZE;
  const listState = useListState(transactionsQuery, transactions.length === 0);

  return (
    <div className="rounded-sm border border-gray-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-600">Start date</label>
          <DatePicker
            value={startDate}
            onChange={(next) => {
              setOffset(0);
              setStartDate(next);
            }}
            className="mt-0.5 w-full text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-600">End date</label>
          <DatePicker
            value={endDate}
            onChange={(next) => {
              setOffset(0);
              setEndDate(next);
            }}
            className="mt-0.5 w-full text-sm"
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

      <ParityTable
        columns={ARCHIVED_TX_COLUMNS}
        rows={transactions}
        rowKey={(row) => row.id}
        loading={listState.isLoading}
        storageKey="banking-bank-account-detail-archived"
        tableTestId="bank-account-detail-archived-table"
        initialPageSize={PAGE_SIZE}
        // Settled-only empty text (LIST-EMPTY-1): supplied only once listState.isEmpty resolves on a
        // settled zero-row query, never mid-fetch.
        emptyText={listState.isEmpty ? "No transactions found for this filter." : undefined}
      />

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
  );
}
