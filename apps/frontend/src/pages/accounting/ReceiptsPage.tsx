import { useMemo, useState } from "react";
import { formatDateUS } from "../../lib/formatDate";
import { formatUsdCents } from "../../lib/money";
import { titleize } from "../../lib/titleize";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { getReceipts, getReceiptDetail, type ReceiptItem } from "../../api/receipts";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";

const fmtCents = (c: number | null) => (c == null ? "—" : formatUsdCents(c));
const fmtDate = (s: string | null) => formatDateUS(s) || "—";
const fmtBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700", posted: "bg-slate-100 text-slate-700",
  void: "bg-red-100 text-red-700", approved: "bg-slate-100 text-slate-700",
  pending_approval: "bg-slate-100 text-slate-700",
};

function ReceiptDetailPanel({ id, companyId, onClose }: { id: string; companyId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["receipt-detail", id, companyId],
    queryFn: () => getReceiptDetail(id, companyId),
    enabled: Boolean(id && companyId),
  });

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={(e: { stopPropagation(): void }) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900">Receipt Detail</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        {isLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : !data ? (
          <p className="text-sm text-red-600">Failed to load receipt.</p>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="flex gap-2"><span className="text-gray-500 w-28 shrink-0">Filename</span><span className="font-medium truncate">{data.filename}</span></div>
            <div className="flex gap-2"><span className="text-gray-500 w-28 shrink-0">Type</span><span>{data.content_type}</span></div>
            <div className="flex gap-2"><span className="text-gray-500 w-28 shrink-0">Size</span><span>{fmtBytes(data.size_bytes)}</span></div>
            <div className="flex gap-2"><span className="text-gray-500 w-28 shrink-0">Uploaded</span><span>{fmtDate(data.uploaded_at)}</span></div>
            {data.notes && <div className="flex gap-2"><span className="text-gray-500 w-28 shrink-0">Notes</span><span>{data.notes}</span></div>}
            <hr />
            <div className="flex gap-2">
              <span className="text-gray-500 w-28 shrink-0">Linked to</span>
              <Link to={data.source.detail_path} className="text-slate-700 hover:underline capitalize">
                {data.source.type} {data.source.type === "expense" ? data.source.expense_number : data.source.bill_number}
              </Link>
            </div>
            <div className="flex gap-2"><span className="text-gray-500 w-28 shrink-0">Amount</span><span>{fmtCents(data.source.amount_cents)}</span></div>
            <div className="flex gap-2"><span className="text-gray-500 w-28 shrink-0">Date</span><span>{fmtDate(data.source.date)}</span></div>
            <hr />
            <a href={data.download_url} target="_blank" rel="noreferrer"
              className="inline-block rounded-sm bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">
              Download Receipt ↗
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export function ReceiptsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const [entityType, setEntityType] = useState<"" | "expense" | "bill">("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  const limit = 50;

  const listQuery = useQuery({
    queryKey: ["receipts", operatingCompanyId, entityType, search, offset],
    queryFn: () => getReceipts({
      operating_company_id: operatingCompanyId,
      entity_type: entityType || undefined,
      q: search || undefined,
      limit, offset,
    }),
    enabled: Boolean(selectedCompanyId),
  });
  const { data, isPending, isFetching, isError } = listQuery;

  const total = data?.total ?? 0;
  const items = data?.items ?? [];

  const columns = useMemo<ParityColumn<ReceiptItem>[]>(
    () => [
      { key: "uploaded_at", label: "Uploaded", sortable: true, render: (row) => fmtDate(row.uploaded_at) },
      {
        key: "filename",
        label: "Filename",
        sortable: true,
        render: (row) => (
          <button onClick={() => setDetailId(row.id)} className="text-slate-700 hover:underline text-left truncate max-w-full" title={row.filename}>
            {row.filename}
          </button>
        ),
      },
      { key: "size_bytes", label: "Size", sortable: true, render: (row) => fmtBytes(row.size_bytes) },
      {
        key: "source_type",
        label: "Source",
        sortable: true,
        render: (row) => (
          <span className="inline-block rounded-sm bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-700 capitalize">{row.source.type}</span>
        ),
      },
      {
        key: "ref",
        label: "Ref #",
        render: (row) => (
          <Link to={row.source.detail_path} className="text-slate-700 hover:underline text-xs">
            {row.source.type === "expense" ? (row.source.expense_number ?? "—") : (row.source.bill_number ?? "—")}
          </Link>
        ),
      },
      { key: "source_date", label: "Date", render: (row) => fmtDate(row.source.date) },
      { key: "amount_cents", label: "Amount", className: "text-right", cellClass: "text-right tabular-nums", render: (row) => fmtCents(row.source.amount_cents) },
      {
        key: "status",
        label: "Status",
        render: (row) =>
          row.source.status ? (
            <span className={`inline-block rounded-sm px-2 py-0.5 text-xs font-semibold ${STATUS_COLOR[row.source.status] ?? "bg-gray-100 text-gray-600"}`}>
              {titleize(row.source.status)}
            </span>
          ) : null,
      },
      {
        key: "actions",
        label: "Actions",
        alwaysVisible: true,
        render: (row) => (
          <button onClick={() => setDetailId(row.id)} className="text-xs text-slate-700 hover:underline">View</button>
        ),
      },
    ],
    [],
  );

  const filterBar = (
    <div className="flex flex-wrap gap-2 items-center">
      <input type="search" aria-label="Search receipts by filename or notes" placeholder="Search filename, notes…" value={search}
        onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
        className="rounded-sm border border-gray-300 px-3 py-1.5 text-sm w-56 focus:outline-hidden focus:ring-1 focus:ring-emerald-500" />
      <select aria-label="Filter receipts by source" value={entityType} onChange={(e) => { setEntityType(e.target.value as "" | "expense" | "bill"); setOffset(0); }}
        className="rounded-sm border border-gray-300 px-3 py-1.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-emerald-500">
        <option value="">All sources</option>
        <option value="expense">Expenses</option>
        <option value="bill">Bills</option>
      </select>
      <span className="ml-auto self-center text-xs text-gray-500">{total.toLocaleString()} receipt{total !== 1 ? "s" : ""}</span>
    </div>
  );

  return (
    <AccountingSubNavWrapper title="Receipts" subtitle="Uploaded receipts linked to expenses and bills">
      {detailId && <ReceiptDetailPanel id={detailId} companyId={operatingCompanyId} onClose={() => setDetailId(null)} />}

      {isError ? <p className="text-sm text-red-600 py-2 text-center">Failed to load receipts.</p> : null}

      <ParityTable
        columns={columns}
        rows={items}
        rowKey={(row) => row.id}
        loading={isPending || (isFetching && items.length === 0)}
        filterBar={filterBar}
        storageKey="receipts-list"
        initialPageSize={limit}
        emptyText="No receipts found."
      />

      {total > limit && (
        <div className="flex items-center justify-between mt-3 text-sm text-gray-600">
          <button onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0}
            className="rounded-sm border border-gray-300 px-3 py-1 disabled:opacity-40 hover:bg-gray-50">← Prev</button>
          <span>{offset + 1}–{Math.min(offset + limit, total)} of {total.toLocaleString()}</span>
          <button onClick={() => setOffset(offset + limit)} disabled={offset + limit >= total}
            className="rounded-sm border border-gray-300 px-3 py-1 disabled:opacity-40 hover:bg-gray-50">Next →</button>
        </div>
      )}
    </AccountingSubNavWrapper>
  );
}

export default ReceiptsPage;
