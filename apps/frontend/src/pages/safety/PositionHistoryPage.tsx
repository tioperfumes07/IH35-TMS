/**
 * M2: Position History Page
 * View timeline of part installations/removals/replacements
 * Accessible from Safety > Integrity > Position History
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { listPositionHistory } from "../../api/position-history";
import { useCompanyContext } from "../../contexts/CompanyContext";

function formatDateTime(isoString: string): string {
  return new Date(isoString).toLocaleString();
}

export default function PositionHistoryPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [searchParams] = useSearchParams();
  
  // Filters
  const [unitFilter, setUnitFilter] = useState(searchParams.get("unit_id") || "");
  const [actionFilter, setActionFilter] = useState<"" | "installed" | "removed" | "replaced">(
    (searchParams.get("action") as "" | "installed" | "removed" | "replaced") || ""
  );
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);

  const historyQuery = useQuery({
    queryKey: ["position-history", companyId, unitFilter, actionFilter, limit, offset],
    queryFn: () =>
      listPositionHistory(companyId, {
        unit_id: unitFilter || undefined,
        action: actionFilter || undefined,
        limit,
        offset,
      }),
    enabled: Boolean(companyId),
  });

  const records = historyQuery.data?.rows || [];
  const total = historyQuery.data?.total || 0;

  const actionBadgeClass = (action: string) => {
    switch (action) {
      case "installed":
        return "bg-green-100 text-green-800";
      case "removed":
        return "bg-red-100 text-red-800";
      case "replaced":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Position History</h1>
        <p className="text-sm text-gray-500">
          Track part installations, removals, and replacements
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Unit ID:</label>
          <input
            type="text"
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value)}
            placeholder="Filter by unit"
            className="rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Action:</label>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value as "" | "installed" | "removed" | "replaced")}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">All</option>
            <option value="installed">Installed</option>
            <option value="removed">Removed</option>
            <option value="replaced">Replaced</option>
          </select>
        </div>

        <button
          onClick={() => {
            setUnitFilter("");
            setActionFilter("");
            setOffset(0);
          }}
          className="rounded bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          Clear Filters
        </button>

        <div className="ml-auto text-sm text-gray-500">
          Showing {records.length} of {total} records
        </div>
      </div>

      {/* Table - Mobile Responsive Pattern */}
      <div className="mobile-table-fallback w-full" data-testid="mobile-optimized-table">
        {/* Desktop Table */}
        <div className="hidden overflow-x-auto sm:block">
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Timestamp</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Action</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Unit</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Position</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Part</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Actor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {historyQuery.isLoading ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">Loading...</td></tr>
                ) : records.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No position history records found</td></tr>
                ) : (
                  records.map((record) => (
                    <tr key={record.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">{formatDateTime(record.action_at)}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${actionBadgeClass(record.action)}`}>{record.action}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                        <div>{record.unit_number || record.unit_id}</div>
                        {record.unit_license_plate && <div className="text-xs text-gray-500">{record.unit_license_plate}</div>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                        <div className="font-medium">{record.position_code}</div>
                        {record.position_set_name && <div className="text-xs text-gray-500">{record.position_set_name}</div>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                        {record.part_number ? (
                          <div><div className="font-medium">{record.part_number}</div>{record.part_name && <div className="text-xs text-gray-500">{record.part_name}</div>}</div>
                        ) : (<span className="text-gray-400">-</span>)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">{record.actor_name || record.actor_id}</td>
                      <td className="max-w-xs px-4 py-3 text-sm text-gray-900">
                        {record.action_reason || record.notes ? (
                          <div>{record.action_reason && <div className="text-xs text-gray-600">{record.action_reason}</div>}{record.notes && <div className="mt-1 text-xs text-gray-500">{record.notes}</div>}</div>
                        ) : (<span className="text-gray-400">-</span>)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile Card View */}
        <div className="space-y-3 sm:hidden">
          {historyQuery.isLoading ? (
            <p className="text-center text-gray-500">Loading...</p>
          ) : records.length === 0 ? (
            <p className="text-center text-gray-500">No position history records found</p>
          ) : (
            records.map((record) => (
              <article key={record.id} className="rounded border border-gray-200 bg-white p-3 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${actionBadgeClass(record.action)}`}>{record.action}</span>
                  <span className="text-xs text-gray-500">{formatDateTime(record.action_at)}</span>
                </div>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Unit</p>
                    <p className="text-sm text-gray-900">{record.unit_number || record.unit_id}{record.unit_license_plate && <span className="text-xs text-gray-500"> ({record.unit_license_plate})</span>}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Position</p>
                    <p className="text-sm text-gray-900">{record.position_code}{record.position_set_name && <span className="text-xs text-gray-500"> — {record.position_set_name}</span>}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Part</p>
                    <p className="text-sm text-gray-900">{record.part_number || <span className="text-gray-400">-</span>}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Actor</p>
                    <p className="text-sm text-gray-900">{record.actor_name || record.actor_id}</p>
                  </div>
                  {(record.action_reason || record.notes) && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Notes</p>
                      <p className="text-sm text-gray-900">{record.action_reason || record.notes}</p>
                    </div>
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      </div>

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setOffset((o) => Math.max(0, o - limit))}
            disabled={offset === 0}
            className="rounded bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">
            Page {Math.floor(offset / limit) + 1} of {Math.ceil(total / limit)}
          </span>
          <button
            onClick={() => setOffset((o) => Math.min(total - limit, o + limit))}
            disabled={offset + limit >= total}
            className="rounded bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
