/**
 * M2: Position History Page
 * View timeline of part installations/removals/replacements
 * Accessible from Safety > Integrity > Position History
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { listPositionHistory, type PositionHistoryRecord } from "../../api/position-history";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLink } from "../../components/shared/EntityLink";

function formatDateTime(isoString: string): string {
  return new Date(isoString).toLocaleString();
}

function actionBadgeClass(action: string) {
  switch (action) {
    case "installed":
      return "bg-slate-100 text-slate-700";
    case "removed":
      return "bg-red-100 text-red-800";
    case "replaced":
      return "bg-slate-100 text-slate-700";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

export default function PositionHistoryPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [searchParams] = useSearchParams();

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

  const records = historyQuery.data?.rows ?? [];
  const total = historyQuery.data?.total ?? 0;

  const columns = useMemo<Array<ParityColumn<PositionHistoryRecord>>>(
    () => [
      {
        key: "action_at",
        label: "Timestamp",
        sortable: true,
        sortValue: (row) => new Date(row.action_at).getTime(),
        render: (row) => (
          <span className="whitespace-nowrap text-gray-900">{formatDateTime(row.action_at)}</span>
        ),
      },
      {
        key: "action",
        label: "Action",
        sortable: true,
        render: (row) => (
          <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${actionBadgeClass(row.action)}`}>
            {row.action}
          </span>
        ),
      },
      {
        key: "unit_id",
        label: "Unit",
        sortable: true,
        sortValue: (row) => row.unit_number ?? row.unit_id,
        render: (row) => (
          <div>
            <EntityLink
              kind="unit"
              id={row.unit_id}
              label={row.unit_number ?? row.unit_id}
            />
            {row.unit_license_plate ? <div className="text-xs text-gray-500">{row.unit_license_plate}</div> : null}
          </div>
        ),
      },
      {
        key: "position_code",
        label: "Position",
        sortable: true,
        render: (row) => (
          <div>
            <div className="font-medium">{row.position_code}</div>
            {row.position_set_name ? <div className="text-xs text-gray-500">{row.position_set_name}</div> : null}
          </div>
        ),
      },
      {
        key: "part_number",
        label: "Part",
        sortable: true,
        sortValue: (row) => row.part_number ?? "",
        render: (row) =>
          row.part_number ? (
            <div>
              <div className="font-medium">{row.part_number}</div>
              {row.part_name ? <div className="text-xs text-gray-500">{row.part_name}</div> : null}
            </div>
          ) : (
            <span className="text-gray-400">-</span>
          ),
      },
      {
        key: "actor_id",
        label: "Actor",
        sortable: true,
        sortValue: (row) => row.actor_name ?? row.actor_id,
        render: (row) =>
          row.actor_name ? (
            <span className="text-gray-900">{row.actor_name}</span>
          ) : row.actor_id ? (
            <span className="font-mono text-xs text-gray-900">{row.actor_id}</span>
          ) : (
            <span className="text-gray-400">—</span>
          ),
      },
      {
        key: "notes",
        label: "Notes",
        render: (row) =>
          row.action_reason || row.notes ? (
            <div className="max-w-xs">
              {row.action_reason ? <div className="text-xs text-gray-600">{row.action_reason}</div> : null}
              {row.notes ? <div className="mt-1 text-xs text-gray-500">{row.notes}</div> : null}
            </div>
          ) : (
            <span className="text-gray-400">-</span>
          ),
      },
    ],
    []
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Position History</h1>
        <p className="text-sm text-gray-500">Track part installations, removals, and replacements</p>
      </div>

      <div className="flex flex-wrap gap-4 rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Unit ID:</label>
          <input
            type="text"
            value={unitFilter}
            onChange={(e) => setUnitFilter(e.target.value)}
            placeholder="Filter by unit"
            className="rounded-sm border border-gray-300 px-3 py-1.5 text-sm focus:border-slate-300 focus:outline-hidden"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Action:</label>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value as "" | "installed" | "removed" | "replaced")}
            className="rounded-sm border border-gray-300 px-3 py-1.5 text-sm focus:border-slate-300 focus:outline-hidden"
          >
            <option value="">All</option>
            <option value="installed">Installed</option>
            <option value="removed">Removed</option>
            <option value="replaced">Replaced</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => {
            setUnitFilter("");
            setActionFilter("");
            setOffset(0);
          }}
          className="rounded-sm bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          Clear Filters
        </button>

        <div className="ml-auto text-sm text-gray-500">
          Showing {records.length} of {total} records
        </div>
      </div>

      {historyQuery.isError ? (
        <ListErrorState
          title="Couldn't load position history"
          status={0}
          message={(historyQuery.error as Error)?.message}
          onRetry={() => void historyQuery.refetch()}
        />
      ) : (
        <div className="mobile-table-fallback w-full" data-testid="mobile-optimized-table">
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white p-2">
            <ParityTable<PositionHistoryRecord>
              columns={columns}
              rows={records}
              rowKey={(row) => row.id}
              loading={historyQuery.isLoading}
              storageKey="safety-position-history"
              emptyText="No position history records found"
              exportFilename="position-history"
              tableTestId="position-history-table"
              rowTestId={(row) => `position-history-row-${row.id}`}
              initialPageSize={limit}
              pageSizeOptions={[limit]}
            />
          </div>
        </div>
      )}

      {total > limit && !historyQuery.isError ? (
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setOffset((o) => Math.max(0, o - limit))}
            disabled={offset === 0 || historyQuery.isLoading}
            className="rounded-sm bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-xs ring-1 ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">
            Page {Math.floor(offset / limit) + 1} of {Math.ceil(total / limit)}
          </span>
          <button
            type="button"
            onClick={() => setOffset((o) => Math.min(total - limit, o + limit))}
            disabled={offset + limit >= total || historyQuery.isLoading}
            className="rounded-sm bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-xs ring-1 ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
