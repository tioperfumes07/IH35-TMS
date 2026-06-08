import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiRequest } from "../../api/client";

export type OperationsColumn = {
  key: string;
  label: string;
};

type PagedResponse = {
  sub_view: string;
  rows: Array<Record<string, unknown>>;
  page: number;
  page_size: number;
  total: number;
  has_more: boolean;
};

type Props = {
  driverId: string;
  operatingCompanyId: string;
  subView: string;
  title: string;
  description?: string;
  columns: OperationsColumn[];
};

function formatCell(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

/**
 * Generic read-only paged history table shared by all 12 driver operations-depth
 * sub-views. Fetches from /api/drivers/:uuid/operations/<sub-view>.
 */
export function OperationsHistoryTable({ driverId, operatingCompanyId, subView, title, description, columns }: Props) {
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ["driver-operations", subView, driverId, operatingCompanyId, page],
    queryFn: () =>
      apiRequest<PagedResponse>(
        `/api/drivers/${driverId}/operations/${subView}?operating_company_id=${operatingCompanyId}&page=${page}&page_size=25`
      ),
    enabled: Boolean(driverId) && Boolean(operatingCompanyId),
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const hasMore = query.data?.has_more ?? false;

  return (
    <div className="space-y-2" data-testid={`driver-operations-${subView}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {description ? <p className="text-xs text-gray-600">{description}</p> : null}
        </div>
        <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">{total} record(s)</span>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              {columns.map((column) => (
                <th key={column.key} className="px-2 py-1.5 font-semibold text-gray-700">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {query.isLoading ? (
              <tr>
                <td className="px-2 py-2 text-gray-500" colSpan={columns.length}>
                  Loading…
                </td>
              </tr>
            ) : null}
            {!query.isLoading &&
              rows.map((row, index) => (
                <tr key={String(row.uuid ?? index)} className="border-b border-gray-100">
                  {columns.map((column) => (
                    <td key={column.key} className="px-2 py-1.5 text-gray-800">
                      {formatCell(row[column.key])}
                    </td>
                  ))}
                </tr>
              ))}
            {!query.isLoading && rows.length === 0 ? (
              <tr>
                <td className="px-2 py-2 text-gray-500" colSpan={columns.length}>
                  No records found for this driver.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-2 text-xs">
        <button
          type="button"
          className="rounded border border-gray-300 px-2 py-1 disabled:opacity-50"
          onClick={() => setPage((current) => Math.max(1, current - 1))}
          disabled={page <= 1 || query.isLoading}
        >
          Previous
        </button>
        <span className="text-gray-600">Page {page}</span>
        <button
          type="button"
          className="rounded border border-gray-300 px-2 py-1 disabled:opacity-50"
          onClick={() => setPage((current) => current + 1)}
          disabled={!hasMore || query.isLoading}
        >
          Next
        </button>
      </div>
    </div>
  );
}
