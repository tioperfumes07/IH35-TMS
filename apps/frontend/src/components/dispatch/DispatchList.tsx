import type { DispatchLoadRow } from "../../api/loads";
import "../../design/design-tokens.css";
import type { DataTableErrorState } from "../../lib/tableError";
import { Button } from "../Button";
import { ListErrorState } from "../ListErrorState";
import { FLAG_EMOJI_BY_CODE, STATUS_LABEL, formatMoneyCents } from "./constants";
import { InTransitEtaChip } from "./InTransitEtaChip";

type SortField = "created_at" | "load_number" | "status" | "rate_total_cents";
type SortDirection = "asc" | "desc";

export type DispatchListProps = {
  loads: DispatchLoadRow[];
  totalCount: number;
  limit: number;
  offset: number;
  loading: boolean;
  sortField: SortField;
  sortDirection: SortDirection;
  onSortChange: (field: SortField, direction: SortDirection) => void;
  onPageChange: (nextOffset: number) => void;
  onRowClick: (loadId: string) => void;
  onExportCsv: () => void;
  listError?: DataTableErrorState;
  /** P6-T11191: poll backend ETA for in_transit rows */
  showEtaColumn?: boolean;
};

function statusVariant(status: DispatchLoadRow["status"]) {
  if (status === "cancelled") return "bg-red-100 text-red-700";
  if (status === "delivered") return "bg-emerald-100 text-emerald-700";
  if (status === "in_transit" || status === "at_pickup" || status === "at_delivery") return "bg-blue-100 text-blue-700";
  if (status === "closed" || status === "paid" || status === "invoiced") return "bg-gray-200 text-gray-700";
  return "bg-amber-100 text-amber-700";
}

export function DispatchList({
  loads,
  totalCount,
  limit,
  offset,
  loading,
  sortField,
  sortDirection,
  onSortChange,
  onPageChange,
  onRowClick,
  onExportCsv,
  listError,
  showEtaColumn = false,
}: DispatchListProps) {
  const from = totalCount === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, totalCount);
  const hasPrev = offset > 0;
  const hasNext = offset + limit < totalCount;

  const onHeaderClick = (field: SortField) => {
    if (sortField !== field) {
      onSortChange(field, "asc");
      return;
    }
    onSortChange(field, sortDirection === "asc" ? "desc" : "asc");
  };

  if (listError) {
    return (
      <section className="space-y-2">
        <ListErrorState
          title="Couldn't load dispatch list"
          status={listError.status}
          message={listError.message}
          onRetry={listError.onRetry}
        />
      </section>
    );
  }

  if (!loading && loads.length === 0) {
    return (
      <div className="rounded border border-gray-200 bg-white p-6 text-sm text-gray-500">
        No loads match your filters.{" "}
        <button type="button" className="font-semibold text-blue-700 hover:underline" onClick={() => onPageChange(0)}>
          Go back to first page
        </button>
      </div>
    );
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">Showing {from}-{to} of {totalCount}</div>
        <Button type="button" variant="secondary" size="sm" onClick={onExportCsv}>
          Export CSV
        </Button>
      </div>

      <div className="hidden overflow-x-auto rounded border border-gray-200 bg-white md:block">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
            <tr>
              <th className="px-3 py-2">Flag</th>
              {[
                ["load_number", "Load #"],
                ["customer", "Customer"],
                ["pickup", "Pickup"],
                ["delivery", "Delivery"],
                ["unit", "Unit"],
                ["driver", "Driver"],
                ["status", "Status"],
                ...(showEtaColumn ? [["eta", "ETA"] as const] : []),
                ["rate_total_cents", "Rate"],
                ["created_at", "Created"],
              ].map(([key, label]) => (
                <th key={key} className="px-3 py-2">
                  {key === "load_number" || key === "status" || key === "rate_total_cents" || key === "created_at" ? (
                    <button type="button" className="inline-flex items-center gap-1" onClick={() => onHeaderClick(key as SortField)}>
                      {label}
                      {sortField === key ? (sortDirection === "asc" ? "▲" : "▼") : ""}
                    </button>
                  ) : (
                    label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: Math.max(4, limit / 10) }).map((_, idx) => (
                  <tr key={idx} className="border-b border-gray-100">
                    <td colSpan={showEtaColumn ? 11 : 10} className="px-3 py-3 text-gray-400">
                      Loading loads...
                    </td>
                  </tr>
                ))
              : loads.map((load) => (
                  <tr
                    key={load.id}
                    onClick={() => onRowClick(load.id)}
                    className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="px-3 py-2">{FLAG_EMOJI_BY_CODE[load.flag_code] ?? "⚪"}</td>
                    <td className="code-cell px-3 py-2 font-medium text-gray-800">{load.load_number}</td>
                    <td className="min-w-0 max-w-[240px] px-3 py-2">
                      <span title={load.customer_name ?? undefined} className="single-line-name">
                        {load.customer_name ?? "-"}
                      </span>
                    </td>
                    <td className="px-3 py-2">{load.first_pickup_city ?? "-"}</td>
                    <td className="px-3 py-2">{load.first_delivery_city ?? "-"}</td>
                    <td className="code-cell px-3 py-2">{load.assigned_unit_number ?? "-"}</td>
                    <td className="min-w-0 max-w-[240px] px-3 py-2">
                      <span title={load.assigned_primary_driver_name ?? undefined} className="single-line-name">
                        {load.assigned_primary_driver_name ?? "Unassigned"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusVariant(load.status)}`}>
                        {STATUS_LABEL[load.status]}
                      </span>
                    </td>
                    {showEtaColumn ? (
                      <td className="px-3 py-2 align-middle">
                        {load.status === "in_transit" ? (
                          <InTransitEtaChip loadId={load.id} operatingCompanyId={load.operating_company_id} />
                        ) : (
                          <span className="text-[11px] text-gray-300">—</span>
                        )}
                      </td>
                    ) : null}
                    <td className="px-3 py-2">{formatMoneyCents(load.rate_total_cents, load.currency_code)}</td>
                    <td className="px-3 py-2">{new Date(load.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 md:hidden">
        {loading ? <div className="rounded border border-gray-200 bg-white p-3 text-sm text-gray-500">Loading loads...</div> : null}
        {!loading &&
          loads.map((load) => (
            <button
              key={load.id}
              type="button"
              onClick={() => onRowClick(load.id)}
              className="w-full rounded border border-gray-200 bg-white p-3 text-left"
            >
              <div className="flex items-center justify-between">
                <div className="code-cell font-semibold">{load.load_number}</div>
                <div>{FLAG_EMOJI_BY_CODE[load.flag_code] ?? "⚪"}</div>
              </div>
              <div className="mt-1 min-w-0 text-sm text-gray-700">
                <span title={load.customer_name ?? undefined} className="single-line-name">
                  {load.customer_name ?? "-"}
                </span>
              </div>
              <div className="mt-1 text-xs text-gray-500">
                {load.first_pickup_city ?? "-"} {"->"} {load.first_delivery_city ?? "-"}
              </div>
              <div className="mt-2 flex min-w-0 items-center justify-between text-xs">
                <span title={load.assigned_primary_driver_name ?? undefined} className="single-line-name">
                  {load.assigned_primary_driver_name ?? "Unassigned"}
                </span>
                <span>{formatMoneyCents(load.rate_total_cents, load.currency_code)}</span>
              </div>
              {showEtaColumn && load.status === "in_transit" ? (
                <div className="mt-2">
                  <InTransitEtaChip loadId={load.id} operatingCompanyId={load.operating_company_id} />
                </div>
              ) : null}
            </button>
          ))}
      </div>

      <div className="flex items-center justify-between border-t border-gray-200 pt-2 text-sm">
        <Button type="button" variant="secondary" size="sm" disabled={!hasPrev} onClick={() => onPageChange(Math.max(0, offset - limit))}>
          Previous
        </Button>
        <span className="text-gray-600">
          Showing {from}-{to} of {totalCount}
        </span>
        <Button type="button" variant="secondary" size="sm" disabled={!hasNext} onClick={() => onPageChange(offset + limit)}>
          Next
        </Button>
      </div>
    </section>
  );
}
