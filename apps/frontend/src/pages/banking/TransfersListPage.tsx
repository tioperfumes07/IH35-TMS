import { useMemo, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getPlaidBankAccounts, getTransfer, listTransfers, revokeTransfer, type Transfer, type TransferType } from "../../api/banking";
import { useAuth } from "../../auth/useAuth";
import { PageHeader } from "../../components/layout/PageHeader";
import { ActionButton } from "../../components/shared/ActionButton";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { CollapsedListFilters } from "../../components/table";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { useListState } from "../../components/list-state";
import { formatUsdCents } from "../../lib/money";
import { EntityLink } from "../../components/shared/EntityLink";

const PAGE_SIZE = 50;

function formatMoney(cents: number) {
  return formatUsdCents(cents);
}

function typeLabel(type: TransferType) {
  return type.replaceAll("_", " ");
}

export function TransfersListPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const [fromDate, setFromDate] = useState(new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(new Date().toISOString().slice(0, 10));
  const [type, setType] = useState<TransferType | "">("");
  const [status, setStatus] = useState<"active" | "revoked" | "">("active");
  const [accountId, setAccountId] = useState("");
  const [offset, setOffset] = useState(0);
  const [revokingId, setRevokingId] = useState("");

  const canRevoke = auth.user?.role === "Owner";

  const bankAccountsQuery = useQuery({
    queryKey: ["banking", "plaid-accounts", companyId],
    queryFn: () => getPlaidBankAccounts(companyId),
    enabled: Boolean(companyId),
  });
  const transfersQuery = useQuery({
    queryKey: ["banking", "transfers", companyId, fromDate, toDate, type, status, accountId, offset],
    queryFn: () =>
      listTransfers(companyId, {
        from: fromDate || undefined,
        to: toDate || undefined,
        type: (type || undefined) as TransferType | undefined,
        status: (status || undefined) as "active" | "revoked" | undefined,
        accountId: accountId || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
    enabled: Boolean(companyId),
  });

  const rows = transfersQuery.data?.transfers ?? [];
  const hasNext = rows.length === PAGE_SIZE;
  // Empty message renders only once the transfers query settles, never mid-fetch.
  const listState = useListState(transfersQuery, rows.length === 0);
  const accountNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const account of bankAccountsQuery.data?.accounts ?? []) {
      map.set(account.id, `${account.institution_name || "Bank"} - ${account.account_name || "Account"}`);
    }
    return map;
  }, [bankAccountsQuery.data?.accounts]);

  // Display-only ParityTable migration: column order, cell formatting (amount sign/currency via
  // formatMoney), and the View/Revoke inline action handlers are preserved 1:1 from the former
  // hand-rolled table markup.
  const columns = useMemo<ParityColumn<Transfer>[]>(
    () => [
      { key: "transfer_date", label: "Date", sortable: true, render: (row) => row.transfer_date },
      {
        key: "transfer_type",
        label: "Type",
        sortable: true,
        cellClass: "capitalize",
        render: (row) => typeLabel(row.transfer_type),
      },
      {
        key: "from_account_id",
        label: "From",
        render: (row) => (
          <EntityLink kind="bank_account" id={row.from_account_id} label={row.from_bank_name || row.from_coa_name || accountNameMap.get(row.from_account_id) || undefined} />
        ),
      },
      {
        key: "to_account_id",
        label: "To",
        render: (row) => (
          <EntityLink kind="bank_account" id={row.to_account_id} label={row.to_bank_name || row.to_coa_name || accountNameMap.get(row.to_account_id) || undefined} />
        ),
      },
      {
        key: "amount_cents",
        label: "Amount",
        sortable: true,
        sortValue: (row) => Number(row.amount_cents),
        render: (row) => formatMoney(Number(row.amount_cents)),
      },
      { key: "memo", label: "Memo", render: (row) => row.memo || "-" },
      { key: "reference_number", label: "Reference", render: (row) => row.reference_number || "-" },
      {
        key: "qbo_status",
        label: "QBO Status",
        render: (row) =>
          row.revoked_at ? (
            <span className="rounded-sm bg-gray-100 px-2 py-0.5 text-xs text-gray-700">revoked</span>
          ) : row.qbo_journal_entry_id ? (
            <span className="rounded-sm bg-slate-100 px-2 py-0.5 text-xs text-slate-700">synced</span>
          ) : (
            <span className="rounded-sm bg-slate-100 px-2 py-0.5 text-xs text-slate-700">pending</span>
          ),
      },
      {
        key: "actions",
        label: "Actions",
        alwaysVisible: true,
        render: (row) => (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="text-xs text-slate-700 hover:underline"
              onClick={() => {
                if (!companyId) return;
                void getTransfer(row.id, companyId)
                  .then((detail) => {
                    window.alert(
                      `Transfer ${detail.transfer.id}\nType: ${detail.transfer.transfer_type}\nAmount: ${formatMoney(
                        Number(detail.transfer.amount_cents)
                      )}\nMemo: ${detail.transfer.memo || "-"}\nQBO JE: ${detail.transfer.qbo_journal_entry_id || "pending"}`
                    );
                  })
                  .catch((error) => pushToast(String((error as Error).message || "Failed to load transfer detail"), "error"));
              }}
            >
              View
            </button>
            {canRevoke && !row.revoked_at ? (
              <button
                type="button"
                className="text-xs text-red-700 hover:underline disabled:opacity-60"
                disabled={revokingId === row.id}
                onClick={() => {
                  const reason = window.prompt("Revocation reason");
                  if (!reason || !companyId) return;
                  setRevokingId(row.id);
                  void revokeTransfer(row.id, companyId, reason)
                    .then(() => {
                      pushToast("Transfer revoked", "success");
                      return Promise.all([
                        queryClient.invalidateQueries({ queryKey: ["banking", "transfers"] }),
                        queryClient.invalidateQueries({ queryKey: ["banking", "plaid-accounts"] }),
                      ]);
                    })
                    .catch((error) => pushToast(String((error as Error).message || "Failed to revoke transfer"), "error"))
                    .finally(() => setRevokingId(""));
                }}
              >
                Revoke
              </button>
            ) : null}
          </div>
        ),
      },
    ],
    [accountNameMap, canRevoke, revokingId, companyId, pushToast, queryClient],
  );

  return (
    <div className="space-y-3">
      <PageHeader
        backHref="/banking"
        title="Transfers"
        subtitle="Bank transfers and credit-card payments"
        actions={
          <div className="flex items-center gap-2">
            <Link to="/banking" className="text-sm text-slate-700 hover:underline">
              Back to Banking Home
            </Link>
          </div>
        }
      />
      {transfersQuery.isError ? <ListErrorBanner onRetry={() => void transfersQuery.refetch()} /> : null}
      {listState.isEmpty ? (
        <div
          className="rounded-sm border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-700"
          data-testid="banking-transfers-never-recorded-banner"
        >
          <p className="font-semibold">No bank transfers recorded for this company in the selected filters.</p>
          <p className="mt-1">
            Transfer workflow is not proven live until at least one transfer is recorded from Banking Home (+ Record
            Transfer / + Pay Credit Card). An empty list is not “all clear” — it is unproven use. Inter-account moves
            that only exist as unmatched for-review bank feed rows still need Match/Categorize on Transactions.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link to="/banking" className="text-xs font-medium text-slate-800 underline">
              Banking Home — Record Transfer
            </Link>
            <Link to="/banking/transactions?type=uncategorized" className="text-xs font-medium text-slate-800 underline">
              Open for-review queue
            </Link>
          </div>
        </div>
      ) : null}

      <CollapsedListFilters
        activeFilterCount={
          (fromDate || toDate ? 1 : 0) + (type ? 1 : 0) + (accountId ? 1 : 0) + (status ? 1 : 0)
        }
        testIdPrefix="transfers"
        dataAttributes={{ "data-transfers-filter-toolbar": "collapsed" }}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <label className="text-xs text-gray-600">
            From
            <DatePicker value={fromDate} onChange={(next) => setFromDate(next)} className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-2 text-sm" />
          </label>
          <label className="text-xs text-gray-600">
            To
            <DatePicker value={toDate} onChange={(next) => setToDate(next)} className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-2 text-sm" />
          </label>
          <label className="text-xs text-gray-600">
            Type
            <SelectCombobox value={type} onChange={(e) => setType(e.target.value as TransferType | "")} className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-2 text-sm">
              <option value="">All</option>
              <option value="bank_to_bank">Bank-to-Bank</option>
              <option value="cc_payment">CC Payment</option>
              <option value="cash_deposit">Cash Deposit</option>
              <option value="owner_contribution">Owner Contribution</option>
              <option value="owner_distribution">Owner Distribution</option>
            </SelectCombobox>
          </label>
          <label className="text-xs text-gray-600">
            Account
            <SelectCombobox value={accountId} onChange={(e) => setAccountId(e.target.value)} className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-2 text-sm">
              <option value="">All</option>
              {(bankAccountsQuery.data?.accounts ?? []).map((account) => (
                <option key={account.id} value={account.id}>
                  {account.institution_name || "Bank"} - {account.account_name || "Account"}
                </option>
              ))}
            </SelectCombobox>
          </label>
          <label className="text-xs text-gray-600">
            Status
            <SelectCombobox value={status} onChange={(e) => setStatus(e.target.value as "active" | "revoked" | "")} className="mt-1 h-8 w-full rounded-sm border border-gray-300 px-2 text-sm">
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="revoked">Revoked</option>
            </SelectCombobox>
          </label>
        </div>
        <div className="mt-2">
          <ActionButton
            onClick={() => {
              setOffset(0);
              void transfersQuery.refetch();
            }}
          >
            Apply
          </ActionButton>
        </div>
      </CollapsedListFilters>

      <ParityTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={listState.isLoading}
        storageKey="banking-transfers-list"
        tableTestId="banking-transfers-list-table"
        initialPageSize={PAGE_SIZE}
        // Settled-only empty text (LIST-EMPTY-1): only supplied once listState resolves to "empty",
        // never mid-fetch, so ParityTable's own gate never flashes a false empty.
        emptyText={listState.isEmpty ? "No transfers found for this filter." : undefined}
      />

      <div className="flex justify-end gap-2">
        <ActionButton
          disabled={offset === 0}
          onClick={() => {
            setOffset((value) => Math.max(0, value - PAGE_SIZE));
          }}
        >
          Previous
        </ActionButton>
        <ActionButton
          disabled={!hasNext}
          onClick={() => {
            setOffset((value) => value + PAGE_SIZE);
          }}
        >
          Next
        </ActionButton>
      </div>
    </div>
  );
}

