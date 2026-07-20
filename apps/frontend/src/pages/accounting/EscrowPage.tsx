import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { EntityLink } from "../../components/shared/EntityLink";
import { listEscrowAccounts, listEscrowPostings, type EscrowAccount, type EscrowPosting } from "../../api/accounting";
import { PageHeader } from "../../components/layout/PageHeader";
import { ListErrorState } from "../../components/ListErrorState";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useUrlSort } from "../../hooks/useUrlSort";
import { EscrowDeductionsPendingTab } from "../driver-finance/EscrowDeductionsPendingTab";

type EscrowViewTab = "accounts" | "pending";

function money(cents: number) {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function dt(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

export function EscrowPage() {
  const { pushToast } = useToast();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  // orphan-triage F1: "Pending Review" surfaces EscrowDeductionsPendingTab (auto-proposed
  // abandonment deductions awaiting Owner decision) — distinct from the accounts/postings ledger
  // below (EscrowPage's original content, kept byte-for-byte under the "Accounts" tab).
  const [viewTab, setViewTab] = useState<EscrowViewTab>("accounts");
  // BANK-SORT-ROLLOUT-ACCT — accounts + postings tables persist sort in URL via useUrlSort.
  const { sortKey, sortDirection, onSortChange } = useUrlSort();
  const {
    sortKey: postingSortKey,
    sortDirection: postingSortDirection,
    onSortChange: onPostingSortChange,
  } = useUrlSort({ key: "post_sort", dir: "post_dir" });

  const accountsQuery = useQuery({
    queryKey: ["accounting", "escrow", "accounts", companyId],
    queryFn: () => listEscrowAccounts(companyId),
    enabled: Boolean(companyId),
  });

  const postingsQuery = useMutation({
    mutationFn: (escrowAccountId: string) => listEscrowPostings(companyId, escrowAccountId, 300),
    onError: (error) =>
      pushToast(String((error as Error)?.message ?? "Failed to load escrow postings"), "error"),
  });

  const accountRows = (accountsQuery.data?.rows ?? []) as EscrowAccount[];

  const selectedAccount = useMemo(
    () => accountRows.find((row) => row.id === selectedAccountId) ?? null,
    [accountRows, selectedAccountId]
  );

  const accountColumns = useMemo<ParityColumn<EscrowAccount>[]>(
    () => [
      {
        key: "holder_id",
        label: "Holder",
        sortable: true,
        render: (row) =>
          row.holder_type === "driver" ? (
            <EntityLink kind="driver" id={row.holder_id} />
          ) : row.holder_type === "vendor" ? (
            <EntityLink kind="vendor" id={row.holder_id} />
          ) : (
            row.holder_id
          ),
      },
      { key: "holder_type", label: "Type", sortable: true },
      { key: "purpose", label: "Purpose", sortable: true },
      { key: "status", label: "Status", sortable: true },
      { key: "balance_cents", label: "Balance", sortable: true, className: "text-right", cellClass: "text-right tabular-nums", render: (row) => money(row.balance_cents) },
      { key: "updated_at", label: "Updated", sortable: true, render: (row) => dt(row.updated_at) },
    ],
    [],
  );

  const postingRows = (postingsQuery.data?.rows ?? []) as EscrowPosting[];
  const postingColumns = useMemo<ParityColumn<EscrowPosting>[]>(
    () => [
      { key: "posted_at", label: "Posted", sortable: true, render: (row) => dt(row.posted_at) },
      { key: "posting_type", label: "Type", sortable: true },
      { key: "amount_cents", label: "Amount", sortable: true, className: "text-right", cellClass: "text-right tabular-nums", render: (row) => money(row.amount_cents) },
      {
        key: "source_type",
        label: "Source",
        sortable: true,
        render: (row) => (
          <>
            {row.source_type}
            {row.source_id ? ` / ${row.source_id}` : ""}
          </>
        ),
      },
      {
        key: "linked_journal_entry_id",
        label: "Journal entry",
        sortable: true,
        render: (row) => <EntityLink kind="journal_entry" id={row.linked_journal_entry_id ?? undefined} label={row.linked_journal_entry_id ? row.linked_journal_entry_id.slice(0, 8) : "—"} />,
      },
    ],
    [],
  );

  return (
    <div className="space-y-4 p-4">
      <PageHeader title="Escrow" subtitle="Escrow accounts and posting history" />

      <div className="flex items-center gap-1 rounded-sm border border-gray-300 p-0.5 text-xs w-fit">
        {(["accounts", "pending"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setViewTab(tab)}
            className={`rounded px-3 py-1 capitalize ${
              viewTab === tab ? "bg-[#1f2a44] text-white" : "text-gray-700 hover:bg-gray-50"
            }`}
          >
            {tab === "accounts" ? "Accounts" : "Pending Review"}
          </button>
        ))}
      </div>

      {viewTab === "pending" ? <EscrowDeductionsPendingTab /> : null}

      {viewTab === "accounts" ? (
        <>
          {!companyId ? <p className="text-sm text-red-600">Select an operating company.</p> : null}

          {accountsQuery.isError ? (
            <div className="rounded-sm border border-slate-200 bg-white">
              <ListErrorState
                title="Couldn't load escrow accounts"
                status={0}
                message={(accountsQuery.error as Error | undefined)?.message}
                onRetry={() => void accountsQuery.refetch()}
              />
            </div>
          ) : (
            <ParityTable
              columns={accountColumns}
              rows={accountRows}
              rowKey={(row) => row.id}
              loading={accountsQuery.isPending || (accountsQuery.isFetching && accountRows.length === 0)}
              onRowClick={(row) => {
                setSelectedAccountId(row.id);
                postingsQuery.mutate(row.id);
              }}
              rowClassName={(row) => (selectedAccountId === row.id ? "bg-slate-100" : "")}
              storageKey="escrow-accounts"
              sortKey={sortKey}
              sortDirection={sortDirection}
              onSortChange={onSortChange}
              emptyText="No escrow accounts found."
            />
          )}

          {selectedAccount ? (
            <div className="rounded-sm border border-slate-200 bg-white p-3 text-sm text-slate-700">
              Selected account: <span className="font-mono">{selectedAccount.id}</span> · Balance {money(selectedAccount.balance_cents)}
            </div>
          ) : null}

          {selectedAccountId ? (
            <ParityTable
              columns={postingColumns}
              rows={postingRows}
              rowKey={(row) => row.id}
              loading={postingsQuery.isPending}
              storageKey="escrow-postings"
              sortKey={postingSortKey}
              sortDirection={postingSortDirection}
              onSortChange={onPostingSortChange}
              emptyText="No escrow postings found for this account."
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
