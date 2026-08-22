import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { EntityLink, type EntityKind } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { formatDateUS } from "../../lib/formatDate";
import { listEscrowAccounts, listEscrowPostings, type EscrowAccount, type EscrowPosting } from "../../api/accounting";
import { ListErrorState } from "../../components/ListErrorState";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useUrlSort } from "../../hooks/useUrlSort";
import { EscrowDeductionsPendingTab } from "../driver-finance/EscrowDeductionsPendingTab";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { userFacingApiError } from "../../lib/api-error-message";

type EscrowViewTab = "accounts" | "pending";

function money(cents: number) {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function dt(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

function escrowSourceEntityKind(sourceType: EscrowPosting["source_type"]): EntityKind | null {
  switch (sourceType) {
    case "driver_settlement":
      return "settlement";
    case "factoring_advance":
      return "factoring_advance";
    case "vendor_bill":
      return "bill";
    default:
      return null;
  }
}

function escrowHolderNoun(holderType: EscrowAccount["holder_type"]): string {
  switch (holderType) {
    case "driver":
      return "Driver";
    case "vendor":
      return "Vendor";
    case "factor":
      return "Factor";
    default:
      return "Holder";
  }
}

function escrowSourceNoun(sourceType: EscrowPosting["source_type"]): string {
  switch (sourceType) {
    case "driver_settlement":
      return "Settlement";
    case "factoring_advance":
      return "Factoring advance";
    case "vendor_bill":
      return "Bill";
    default:
      return "Source";
  }
}

function EscrowPostingSourceLink({ row }: { row: EscrowPosting }) {
  const kind = escrowSourceEntityKind(row.source_type);
  const noun = escrowSourceNoun(row.source_type);
  const label = entityLabel(row.source_label ?? null, row.source_id, noun);
  if (!kind || !row.source_id) {
    return (
      <>
        {row.source_type}
        {row.source_id ? ` / ${label}` : ""}
      </>
    );
  }
  return (
    <>
      {row.source_type}{" "}
      <EntityLink kind={kind} id={row.source_id} label={label} />
    </>
  );
}

export function EscrowPage() {
  const { pushToast } = useToast();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [searchParams] = useSearchParams();
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
      pushToast(userFacingApiError(error, "Failed to load escrow postings"), "error"),
  });

  const accountRows = useMemo(
    () => (accountsQuery.data?.rows ?? []) as EscrowAccount[],
    [accountsQuery.data?.rows]
  );

  // ACCT-SURF-09: deep-link from Settlements (?account_id= / ?holder_id=) so reverse drill lands on a row.
  useEffect(() => {
    if (!accountRows.length) return;
    const accountId = searchParams.get("account_id");
    const holderId = searchParams.get("holder_id");
    if (!accountId && !holderId) return;
    let next: EscrowAccount | undefined;
    if (accountId) next = accountRows.find((row) => row.id === accountId);
    if (!next && holderId) next = accountRows.find((row) => row.holder_id === holderId);
    if (next && next.id !== selectedAccountId) {
      setSelectedAccountId(next.id);
      postingsQuery.mutate(next.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- select when accounts load / URL deep-link changes
  }, [accountRows, searchParams]);

  const accountColumns = useMemo<ParityColumn<EscrowAccount>[]>(
    () => [
      {
        key: "holder_id",
        label: "Holder",
        sortable: true,
        render: (row) =>
          row.holder_type === "driver" ? (
            <EntityLink
              kind="driver"
              id={row.holder_id}
              label={entityLabel(row.holder_label ?? null, row.holder_id, escrowHolderNoun(row.holder_type))}
            />
          ) : row.holder_type === "vendor" ? (
            <EntityLink
              kind="vendor"
              id={row.holder_id}
              label={entityLabel(row.holder_label ?? null, row.holder_id, escrowHolderNoun(row.holder_type))}
            />
          ) : (
            entityLabel(row.holder_label ?? null, row.holder_id, escrowHolderNoun(row.holder_type))
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
        render: (row) => <EscrowPostingSourceLink row={row} />,
      },
      {
        key: "linked_journal_entry_id",
        label: "Journal entry",
        sortable: true,
        render: (row) => (
          <EntityLink
            kind="journal_entry"
            id={row.linked_journal_entry_id ?? undefined}
            label={
              row.linked_journal_entry_id
                ? row.journal_entry_date
                  ? `${formatDateUS(row.journal_entry_date)}${row.journal_entry_memo ? ` — ${row.journal_entry_memo}` : ""}`
                  : entityLabel(row.journal_entry_memo, row.linked_journal_entry_id, "Journal entry")
                : "—"
            }
          />
        ),
      },
    ],
    [],
  );

  return (
    <AccountingSubNavWrapper
      title="Escrow"
      subtitle="Escrow accounts and posting history"
      actions={
          <div className="flex flex-wrap gap-2 text-xs">
            <Link
              to="/driver-finance/settlements"
              className="rounded-sm border border-slate-300 bg-white px-2 py-1 font-medium text-slate-800 hover:bg-slate-50"
              data-testid="escrow-settlements-cross-link"
            >
              Settlements
            </Link>
            <Link
              to="/accounting/factoring"
              className="rounded-sm border border-slate-300 bg-white px-2 py-1 font-medium text-slate-800 hover:bg-slate-50"
              data-testid="escrow-factoring-cross-link"
            >
              Factoring
            </Link>
            <Link
              to="/banking/driver-escrow"
              className="rounded-sm border border-slate-300 bg-white px-2 py-1 font-medium text-slate-800 hover:bg-slate-50"
              data-testid="escrow-banking-virtual-bank-link"
            >
              Banking · Driver Escrow
            </Link>
          </div>
        }
    >
      <div className="space-y-4 p-4">
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
    </AccountingSubNavWrapper>
  );
}
