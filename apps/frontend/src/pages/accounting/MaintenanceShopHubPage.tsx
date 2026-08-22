import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { entityLabel, visibleDocumentLabel } from "../../lib/entity-label";
import { formatDateUS } from "../../lib/formatDate";
import { formatUsdCents } from "../../lib/money";
import { getMaintenanceShopHub, type MaintenanceShopHubRow } from "../../api/maintenance-shop";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLink } from "../../components/shared/EntityLink";
import { useUrlSort } from "../../hooks/useUrlSort";

const fmtCents = (c: number) => formatUsdCents(c);
const fmtDate = (s: string | null) => formatDateUS(s) || "—";

const KIND_LABEL: Record<MaintenanceShopHubRow["kind"], string> = {
  bill: "Bill",
  expense: "Expense",
};

export function MaintenanceShopHubPage() {
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const [offset, setOffset] = useState(0);
  const limit = 50;
  const { sortKey, sortDirection, onSortChange } = useUrlSort();
  const [searchParams, setSearchParams] = useSearchParams();
  const workOrderIdFilter = searchParams.get("work_order_id") ?? undefined;
  const hasFilter = Boolean(workOrderIdFilter);

  const clearFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("work_order_id");
    setSearchParams(next, { replace: true });
    setOffset(0);
  };

  const listQuery = useQuery({
    queryKey: ["accounting-maintenance-shop-hub", operatingCompanyId, offset, workOrderIdFilter],
    queryFn: () =>
      getMaintenanceShopHub(operatingCompanyId, {
        workOrderId: workOrderIdFilter,
        limit,
        offset,
      }),
    enabled: Boolean(selectedCompanyId),
  });
  const { data, isPending, isFetching, isError } = listQuery;

  const total = data?.total ?? 0;
  const items = data?.items ?? [];

  const columns = useMemo<ParityColumn<MaintenanceShopHubRow>[]>(
    () => [
      {
        key: "work_order_display_id",
        label: "Work order",
        sortable: true,
        render: (row) => (
          <EntityLink
            kind="work_order"
            id={row.work_order_id}
            label={entityLabel(row.work_order_display_id, row.work_order_id, "Work order")}
          />
        ),
      },
      {
        key: "unit_code",
        label: "Unit",
        sortable: true,
        render: (row) =>
          row.unit_id ? <EntityLink kind="unit" id={row.unit_id} label={entityLabel(row.unit_code, row.unit_id, "Unit")} /> : "—",
      },
      {
        key: "kind",
        label: "Type",
        sortable: true,
        render: (row) => (
          <span className="inline-block rounded-sm bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
            {KIND_LABEL[row.kind]}
          </span>
        ),
      },
      {
        key: "financial_label",
        label: "Bill / expense",
        sortable: true,
        render: (row) =>
          row.kind === "bill" ? (
            <EntityLink
              kind="bill"
              id={row.financial_id}
              label={visibleDocumentLabel(row.financial_label, row.financial_id, "No bill #")}
            />
          ) : (
            <EntityLink
              kind="expense"
              id={row.financial_id}
              label={visibleDocumentLabel(row.financial_label, row.financial_id, "No expense #")}
            />
          ),
      },
      {
        key: "txn_date",
        label: "Date",
        sortable: true,
        cellClass: "whitespace-nowrap",
        render: (row) => fmtDate(row.txn_date),
      },
      {
        key: "amount_cents",
        label: "Amount",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums font-medium text-slate-700",
        render: (row) => fmtCents(row.amount_cents),
      },
      {
        key: "status",
        label: "Status",
        sortable: true,
        render: (row) => row.status ?? "—",
      },
    ],
    [],
  );

  const filterBar = (
    <div className="flex flex-wrap items-center gap-2" data-maintenance-shop-filter-toolbar="collapsed">
      <div className="px-2 py-1 text-xs text-gray-500">
          {hasFilter
            ? "Scoped to one work order. Clear to see every linked shop bill and expense."
            : "Work orders linked to vendor bills and shop expenses across Maintenance & shop."}
      </div>
      {hasFilter ? (
        <button
          onClick={clearFilter}
          data-testid="maintenance-shop-clear-filter"
          className="rounded-sm border border-gray-300 px-2 py-0.5 text-xs text-slate-700 hover:bg-gray-50"
        >
          Clear work order filter
        </button>
      ) : null}
      <span className="text-xs text-gray-500">
        {total.toLocaleString()} linked document{total !== 1 ? "s" : ""}
      </span>
    </div>
  );

  return (
    <AccountingSubNavWrapper
      title="Maintenance & shop"
      subtitle="Shop work orders linked to bills and expenses — accounting view"
      actions={
        <Link
          to="/maintenance"
          className="rounded-sm border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-800 hover:bg-gray-50"
        >
          Open Maintenance module
        </Link>
      }
    >
      {isError ? <p className="py-2 text-center text-sm text-red-600">Failed to load maintenance shop links.</p> : null}

      <ParityTable
        columns={columns}
        rows={items}
        rowKey={(row) => `${row.kind}:${row.financial_id}`}
        loading={isPending || (isFetching && items.length === 0)}
        filterBar={filterBar}
        storageKey="accounting-maintenance-shop-hub"
        initialPageSize={limit}
        emptyText="No work orders with linked bills or expenses yet."
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSortChange={onSortChange}
      />

      {total > limit ? (
        <div className="mt-3 flex items-center justify-between text-sm text-gray-600">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            className="rounded-sm border border-gray-300 px-3 py-1 hover:bg-gray-50 disabled:opacity-40"
          >
            ← Prev
          </button>
          <span>
            {offset + 1}–{Math.min(offset + limit, total)} of {total.toLocaleString()}
          </span>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={offset + limit >= total}
            className="rounded-sm border border-gray-300 px-3 py-1 hover:bg-gray-50 disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      ) : null}
    </AccountingSubNavWrapper>
  );
}
