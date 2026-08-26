import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatDateUS } from "../../lib/formatDate";
import { formatUsdCents } from "../../lib/money";
import { billVendorDrillId } from "../../api/accounting";
import { getAllocations, type AllocationListItem } from "../../api/allocations";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel, visibleDocumentLabel } from "../../lib/entity-label";
import { useUrlSort } from "../../hooks/useUrlSort";
import { BillAllocationPanel } from "../../components/allocation/BillAllocationPanel";

const fmtCents = (c: number) => formatUsdCents(c);
const fmtDate = (s: string | null) => formatDateUS(s) || "—";

const METHOD_LABEL: Record<string, string> = {
  equal: "Equal split",
  by_value: "By value",
  by_miles: "By miles",
  manual_pct: "Manual %",
};

function ReallocatePanel({
  companyId,
  row,
  onClose,
  onSaved,
}: {
  companyId: string;
  row: AllocationListItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <div
        className="my-auto max-h-[min(90vh,720px)] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-4 shadow-xl"
        onClick={(e: { stopPropagation(): void }) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between">
          <h2 className="text-base font-semibold text-gray-900">Re-allocate bill</h2>
          <button onClick={onClose} className="text-xl leading-none text-gray-400 hover:text-gray-600">
            ×
          </button>
        </div>
        <BillAllocationPanel
          companyId={companyId}
          billId={row.bill_id}
          billLabel={visibleDocumentLabel(row.bill_number, row.bill_id, "Bill")}
          billAmountCents={row.bill_amount_cents}
        />
        <div className="mt-3 flex justify-end">
          <button
            onClick={() => {
              onSaved();
              onClose();
            }}
            className="rounded-sm border border-gray-300 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export function AllocationsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [reallocateRow, setReallocateRow] = useState<AllocationListItem | null>(null);
  const limit = 50;
  const { sortKey, sortDirection, onSortChange } = useUrlSort();

  /*
    REVERSE DRILL (Law §9): the backend route and getAllocations() both accept bill_id / asset_id,
    so a bill or a unit can hand off to this tab scoped to itself. Reading them here is what makes
    `/accounting/allocations?bill_id=…` actually filter — without it the deep link silently showed
    EVERY allocation, which reads as "the link is broken" to an operator holding one bill.
  */
  const [searchParams, setSearchParams] = useSearchParams();
  const billIdFilter = searchParams.get("bill_id") ?? undefined;
  const assetIdFilter = searchParams.get("asset_id") ?? undefined;
  const hasFilter = Boolean(billIdFilter || assetIdFilter);

  const clearFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("bill_id");
    next.delete("asset_id");
    setSearchParams(next, { replace: true });
    setOffset(0);
  };

  const listQuery = useQuery({
    queryKey: ["accounting-allocations", operatingCompanyId, offset, billIdFilter, assetIdFilter],
    queryFn: () =>
      getAllocations({
        operating_company_id: operatingCompanyId,
        limit,
        offset,
        bill_id: billIdFilter,
        asset_id: assetIdFilter,
      }),
    enabled: Boolean(selectedCompanyId),
  });
  const { data, isPending, isFetching, isError } = listQuery;

  const total = data?.total ?? 0;
  const items = data?.items ?? [];

  const columns = useMemo<ParityColumn<AllocationListItem>[]>(
    () => [
      {
        key: "bill_number",
        label: "Bill",
        sortable: true,
        render: (row) => <EntityLink kind="bill" id={row.bill_id} label={visibleDocumentLabel(row.bill_number, row.bill_id, "Bill")} />,
      },
      { key: "bill_date", label: "Bill Date", sortable: true, cellClass: "whitespace-nowrap", render: (row) => fmtDate(row.bill_date) },
      {
        key: "vendor_name",
        label: "Vendor",
        sortable: true,
        render: (row) => (
          <EntityLink
            kind="vendor"
            id={billVendorDrillId({ vendor_uuid: row.vendor_uuid, mdata_vendor_id: row.mdata_vendor_id })}
            label={entityLabel(row.vendor_name, row.vendor_id, "Vendor")}
          />
        ),
      },
      {
        key: "unit_code",
        label: "Unit",
        sortable: true,
        render: (row) => (
          <EntityLink kind="unit" id={row.unit_id} label={entityLabel(row.unit_code, row.unit_id, "Unit")} />
        ),
      },
      {
        key: "gl_account_name",
        label: "GL Account",
        sortable: true,
        // Law §9: the GL account a bill posts to must drill forward to its register, not sit as
        // dead text. coa_account_id is already on the row — it just was not linked.
        render: (row) =>
          row.gl_account_name ? (
            <EntityLink
              kind="account"
              id={row.coa_account_id}
              label={
                <>
                  
                  {row.gl_account_name}
                </>
              }
            />
          ) : (
            "—"
          ),
      },
      {
        key: "allocation_method",
        label: "Method",
        sortable: true,
        render: (row) => (
          <span className="inline-block rounded-sm bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
            {METHOD_LABEL[row.allocation_method] ?? row.allocation_method}
          </span>
        ),
      },
      {
        key: "allocation_pct",
        label: "%",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums text-gray-500",
        render: (row) => `${row.allocation_pct.toFixed(2)}%`,
      },
      {
        key: "allocated_amount_cents",
        label: "Allocated",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums font-medium text-slate-700",
        render: (row) => fmtCents(row.allocated_amount_cents),
      },
      {
        key: "bill_amount_cents",
        label: "Bill Total",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums text-gray-500",
        render: (row) => fmtCents(row.bill_amount_cents),
      },
      {
        key: "actions",
        label: "Actions",
        alwaysVisible: true,
        render: (row) => (
          <button onClick={() => setReallocateRow(row)} className="text-xs text-slate-700 hover:underline">
            Re-allocate
          </button>
        ),
      },
    ],
    [],
  );

  const filterBar = (
    <div className="flex flex-wrap items-center gap-2" data-allocations-filter-toolbar="collapsed">
      <div className="px-2 py-1 text-xs text-gray-500">
          {hasFilter
            ? "Scoped by the bill or unit you drilled in from. Clear to see every allocation."
            : "Open a bill or a unit and use its Allocations link to scope this list."}
      </div>
      {hasFilter ? (
        <button
          onClick={clearFilter}
          data-testid="allocations-clear-filter"
          className="rounded-sm border border-gray-300 px-2 py-0.5 text-xs text-slate-700 hover:bg-gray-50"
        >
          Clear {billIdFilter ? "bill" : "unit"} filter
        </button>
      ) : null}
      <span className="text-xs text-gray-500">
        {total.toLocaleString()} allocation{total !== 1 ? "s" : ""}
      </span>
    </div>
  );

  return (
    <AccountingSubNavWrapper title="Allocations" subtitle="Multi-unit cost allocation across bills (FH-7 §3.14)">
      {reallocateRow && operatingCompanyId ? (
        <ReallocatePanel
          companyId={operatingCompanyId}
          row={reallocateRow}
          onClose={() => setReallocateRow(null)}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["accounting-allocations", operatingCompanyId] })}
        />
      ) : null}

      {isError ? <p className="py-2 text-center text-sm text-red-600">Failed to load allocations.</p> : null}

      <ParityTable
        columns={columns}
        rows={items}
        rowKey={(row) => row.id}
        loading={isPending || (isFetching && items.length === 0)}
        filterBar={filterBar}
        storageKey="accounting-allocations-list"
        initialPageSize={limit}
        emptyText="No allocations found."
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSortChange={onSortChange}
      />

      {total > limit && (
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
      )}
    </AccountingSubNavWrapper>
  );
}

export default AllocationsPage;
