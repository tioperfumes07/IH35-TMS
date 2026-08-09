import { useState } from "react";
import { formatDateUS } from "../../lib/formatDate";
import { formatUsdCents } from "../../lib/money";
import { useQuery } from "@tanstack/react-query";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { EntityLink, type EntityKind } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { getIntegrationTransactions, type IntegrationTxnItem } from "../../api/integration-transactions";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { CollapsedListFilters } from "../../components/table";
import { useUrlSort } from "../../hooks/useUrlSort";

const fmtCents = (c: number | null) => (c == null ? "—" : formatUsdCents(c));
const fmtDate = (s: string | null) => formatDateUS(s) || "—";

const STATUS_COLOR: Record<string, string> = {
  synced: "bg-slate-100 text-slate-700",
  pending: "bg-slate-100 text-slate-700",
  in_flight: "bg-slate-100 text-slate-700",
  failed: "bg-red-100 text-red-800",
  blocked: "bg-gray-100 text-gray-700",
};

const ENTITY_LABELS: Record<string, string> = {
  bank_transaction: "Bank Txn", bill: "Bill", expense: "Expense",
  invoice: "Invoice", journal_entry: "Journal Entry",
};

function integrationEntityKind(entityType: string): EntityKind | null {
  switch (entityType) {
    case "bank_transaction":
      return "bank_transaction";
    case "bill":
      return "bill";
    case "expense":
      return "expense";
    case "invoice":
      return "invoice";
    case "journal_entry":
      return "journal_entry";
    default:
      return null;
  }
}

// Backend caps `limit` at 500 (integration-transactions.routes.ts) — fetch the max in one page and
// let ParityTable's own advanced pager handle client-side paging (same pattern as ExpensesListPage /
// Customers.tsx). Replaces the old manual offset/Prev-Next pager.
const FETCH_LIMIT = 500;

export function IntegrationTransactionsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const [syncStatus, setSyncStatus] = useState("");
  const [entityType, setEntityType] = useState("");
  const [search, setSearch] = useState("");
  // BANK-SORT-ROLLOUT-ACCT: sort persists in URL (?sort=&dir=) via useUrlSort + ParityTable controlled sort.
  const { sortKey, sortDirection, onSortChange } = useUrlSort();

  const txnQuery = useQuery({
    queryKey: ["integration-transactions", operatingCompanyId, syncStatus, entityType, search],
    queryFn: () => getIntegrationTransactions({
      operating_company_id: operatingCompanyId,
      sync_status: syncStatus || undefined,
      entity_type: entityType || undefined,
      q: search || undefined,
      limit: FETCH_LIMIT,
      offset: 0,
    }),
    enabled: Boolean(selectedCompanyId),
  });
  const { data, isPending, isFetching } = txnQuery;

  const total = data?.total ?? 0;
  const items = data?.items ?? [];

  const columns: Array<ParityColumn<IntegrationTxnItem>> = [
    {
      key: "date",
      label: "Date",
      sortable: true,
      sortValue: (row) => row.bank_transaction?.txn_date ?? row.created_at ?? "",
      render: (row) => <span className="whitespace-nowrap text-gray-700">{fmtDate(row.bank_transaction?.txn_date ?? row.created_at)}</span>,
    },
    {
      key: "entity_type",
      label: "Type",
      sortable: true,
      render: (row) => (
        <span className="inline-block whitespace-nowrap rounded-sm bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-700">
          {ENTITY_LABELS[row.entity_type] ?? row.entity_type}
        </span>
      ),
    },
    {
      key: "entity_id",
      label: "Entity",
      sortable: true,
      sortValue: (row) => row.entity_id ?? "",
      render: (row) => {
        const kind = integrationEntityKind(row.entity_type);
        if (!kind || !row.entity_id) {
          return <span className="text-xs text-gray-500">{row.entity_id ? entityLabel(null, row.entity_id, "Entity") : "—"}</span>;
        }
        return (
          <EntityLink
            kind={kind}
            id={row.entity_id}
            label={entityLabel(null, row.entity_id, "Entity")}
          />
        );
      },
    },
    {
      key: "description",
      label: "Description / Merchant",
      sortable: true,
      sortValue: (row) => row.bank_transaction?.merchant_name || row.bank_transaction?.description || "",
      render: (row) => (
        <span className="block max-w-xs truncate text-gray-800">
          {row.bank_transaction?.merchant_name || row.bank_transaction?.description || <span className="text-gray-400 italic">—</span>}
        </span>
      ),
    },
    {
      key: "amount",
      label: "Amount",
      sortable: true,
      className: "text-right",
      cellClass: "text-right tabular-nums",
      sortValue: (row) => {
        const bt = row.bank_transaction;
        if (!bt) return 0;
        const cents = bt.amount_cents ?? 0;
        return bt.is_credit ? cents : -cents;
      },
      render: (row) => {
        const bt = row.bank_transaction;
        if (!bt) return <span className="whitespace-nowrap">—</span>;
        return (
          <span className={`whitespace-nowrap ${bt.is_credit ? "text-slate-700" : "text-gray-800"}`}>
            {bt.is_credit ? "+" : "-"}{fmtCents(bt.amount_cents)}
          </span>
        );
      },
    },
    {
      key: "sync_status",
      label: "Sync Status",
      sortable: true,
      render: (row) => (
        <span className="whitespace-nowrap">
          <span className={`inline-block rounded-sm px-2 py-0.5 text-xs font-semibold ${STATUS_COLOR[row.sync_status] ?? "bg-gray-100 text-gray-700"}`}>
            {row.sync_status}
          </span>
          {row.error_message && (
            <span className="ml-1 inline-block max-w-[160px] truncate align-middle text-xs text-red-600" title={row.error_message}>
              {row.error_message.slice(0, 40)}{row.error_message.length > 40 ? "…" : ""}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "qbo_id",
      label: "QBO ID",
      sortable: true,
      render: (row) => <span className="whitespace-nowrap font-mono text-xs text-gray-500">{row.qbo_id ?? "—"}</span>,
    },
    {
      key: "attempt_count",
      label: "Attempts",
      sortable: true,
      className: "text-center",
      cellClass: "text-center",
      render: (row) => <span className="whitespace-nowrap text-gray-600">{row.attempt_count}</span>,
    },
    {
      key: "synced_at",
      label: "Synced At",
      sortable: true,
      render: (row) => <span className="whitespace-nowrap text-xs text-gray-500">{fmtDate(row.synced_at)}</span>,
    },
    {
      key: "linked_to",
      label: "Linked To",
      sortable: true,
      sortValue: (row) => {
        const bt = row.bank_transaction;
        return bt?.matched_load_id || bt?.matched_bill_id || "";
      },
      render: (row) => {
        const bt = row.bank_transaction;
        return (
          <span className="flex flex-wrap gap-2 whitespace-nowrap text-xs">
            {bt?.matched_load_id ? (
              <EntityLink kind="load" id={bt.matched_load_id} label="Load" />
            ) : null}
            {bt?.matched_bill_id ? (
              <EntityLink kind="bill" id={bt.matched_bill_id} label="Bill" />
            ) : null}
            {!bt?.matched_load_id && !bt?.matched_bill_id ? <span className="text-gray-400">—</span> : null}
          </span>
        );
      },
    },
  ];

  const filterBar = (
    <div className="flex flex-wrap gap-2 items-center" data-integration-tx-filter-toolbar="collapsed">
      <CollapsedListFilters
        activeFilterCount={(syncStatus ? 1 : 0) + (entityType ? 1 : 0)}
        testIdPrefix="integration-tx"
        searchSlot={
          <input
            type="search"
            aria-label="Search transactions by description or QBO ID"
            placeholder="Search description, QBO ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-h-12 h-12 w-56 rounded-sm border border-gray-300 px-3 text-sm focus:outline-hidden focus:ring-1 focus:ring-slate-500"
          />
        }
      >
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Filter by sync status"
            value={syncStatus}
            onChange={(e) => setSyncStatus(e.target.value)}
            className="rounded-sm border border-gray-300 px-3 py-1.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-slate-500"
          >
            <option value="">All statuses</option>
            {(["pending", "in_flight", "synced", "failed", "blocked"] as const).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by entity type"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className="rounded-sm border border-gray-300 px-3 py-1.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-slate-500"
          >
            <option value="">All types</option>
            {Object.entries(ENTITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </CollapsedListFilters>
      <span className="ml-auto self-center text-xs text-gray-500">
        {total.toLocaleString()} record{total !== 1 ? "s" : ""}
      </span>
    </div>
  );

  return (
    <AccountingSubNavWrapper title="Integration Transactions" subtitle="QBO sync queue — all entity sync statuses">
      {txnQuery.isError ? (
        <ListErrorBanner
          message={`Failed to load integration transactions: ${(txnQuery.error as Error)?.message ?? "Request failed"}`}
          onRetry={() => void txnQuery.refetch()}
        />
      ) : null}
      {!txnQuery.isError ? (
        <ParityTable
          columns={columns}
          rows={items}
          rowKey={(row) => row.id}
          // LIST-EMPTY-1 settled gate: loading stays true while pending, and while a refetch is in
          // flight with zero current rows — never renders emptyText mid-fetch.
          loading={isPending || (isFetching && items.length === 0)}
          filterBar={filterBar}
          storageKey="integration-transactions"
          exportFilename="integration-transactions"
          initialPageSize={50}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSortChange={onSortChange}
          emptyText="No integration transactions found."
        />
      ) : null}
    </AccountingSubNavWrapper>
  );
}

export default IntegrationTransactionsPage;
