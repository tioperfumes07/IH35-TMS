import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatDateUS } from "../../lib/formatDate";
import { formatUsdCents } from "../../lib/money";
import { getAllocations, type AllocationListItem } from "../../api/allocations";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLink } from "../../components/shared/EntityLink";
import { CollapsedListFilters } from "../../components/table";
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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-lg bg-white p-4 shadow-xl"
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
          billLabel={row.bill_number ?? row.bill_id}
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

  const listQuery = useQuery({
    queryKey: ["accounting-allocations", operatingCompanyId, offset],
    queryFn: () => getAllocations({ operating_company_id: operatingCompanyId, limit, offset }),
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
        render: (row) => <EntityLink kind="bill" id={row.bill_id} label={row.bill_number ?? row.bill_id.slice(0, 8) + "…"} />,
      },
      { key: "bill_date", label: "Bill Date", sortable: true, cellClass: "whitespace-nowrap", render: (row) => fmtDate(row.bill_date) },
      {
        key: "vendor_name",
        label: "Vendor",
        sortable: true,
        render: (row) => <EntityLink kind="vendor" id={row.vendor_id} label={row.vendor_name ?? row.vendor_id ?? "—"} />,
      },
      {
        key: "unit_code",
        label: "Unit",
        sortable: true,
        render: (row) => <EntityLink kind="unit" id={row.unit_id} label={row.unit_code} />,
      },
      {
        key: "gl_account_name",
        label: "GL Account",
        sortable: true,
        render: (row) =>
          row.gl_account_name ? (
            <span>
              {row.gl_account_number ? <span className="text-gray-400">{row.gl_account_number} · </span> : null}
              {row.gl_account_name}
            </span>
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
      <CollapsedListFilters activeFilterCount={0} testIdPrefix="allocations">
        <p className="px-2 py-1 text-xs text-gray-500">No filters yet — filter by bill or unit from their detail pages.</p>
      </CollapsedListFilters>
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
