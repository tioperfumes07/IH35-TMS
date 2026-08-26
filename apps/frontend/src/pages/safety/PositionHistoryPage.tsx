/**
 * M2: Position History Page
 * View timeline of part installations/removals/replacements
 * Accessible from Safety > Integrity > Position History
 */

import { useEffect, useMemo, useState } from "react";
import { entityLabel, isUnresolvedEntityTombstone } from "../../lib/entity-label";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { listPositionHistory, type PositionHistoryRecord } from "../../api/position-history";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ListErrorState } from "../../components/ListErrorState";
import { EntityPicker } from "../../components/parity/EntityPicker";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLink } from "../../components/shared/EntityLink";
import { Button } from "../../components/Button";
import { useStagedListFilters } from "../../components/table";

type ActionFilter = "" | "installed" | "removed" | "replaced";

const EMPTY_FILTERS: { unitId: string; action: ActionFilter } = { unitId: "", action: "" };

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
  const [searchParams, setSearchParams] = useSearchParams();
  const unitIdFromUrl = searchParams.get("unit_id") || "";
  const actionFromUrl = (searchParams.get("action") as ActionFilter) || "";

  // LST-F5197 — unit/action filters write URL on Apply (not silent draft).
  // LV-SAFETY-POSITION-HISTORY-FILTER-SILENT-APPLY — stage until Apply; Cancel restores.
  function patchSearchParam(next: { unitId: string; action: ActionFilter }) {
    const p = new URLSearchParams(searchParams);
    if (next.unitId) p.set("unit_id", next.unitId);
    else p.delete("unit_id");
    if (next.action) p.set("action", next.action);
    else p.delete("action");
    setSearchParams(p, { replace: true });
  }

  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);

  const [applied, setApplied] = useState<{ unitId: string; action: ActionFilter }>(() => ({
    ...EMPTY_FILTERS,
    unitId: unitIdFromUrl,
    action: actionFromUrl,
  }));
  const staged = useStagedListFilters<{ unitId: string; action: ActionFilter }>({
    applied,
    empty: EMPTY_FILTERS,
    onApply: (next) => {
      setApplied(next);
      patchSearchParam(next);
      setOffset(0);
    },
  });
  const draft = staged.draft;

  useEffect(() => {
    setApplied((prev) => ({
      ...prev,
      unitId: unitIdFromUrl,
      action: actionFromUrl,
    }));
  }, [unitIdFromUrl, actionFromUrl]);

  const historyQuery = useQuery({
    queryKey: ["position-history", companyId, applied.unitId, applied.action, limit, offset],
    queryFn: () =>
      listPositionHistory(companyId, {
        unit_id: applied.unitId || undefined,
        action: applied.action || undefined,
        limit,
        offset,
      }),
    enabled: Boolean(companyId),
  });

  const records = historyQuery.isError ? [] : historyQuery.data?.rows ?? [];
  const total = historyQuery.isError ? 0 : historyQuery.data?.total ?? 0;

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
        sortValue: (row) => entityLabel(row.unit_number, row.unit_id, "Unit"),
        render: (row) => (
          <div>
            <EntityLink
              kind="unit"
              id={row.unit_id}
              label={entityLabel(row.unit_number, row.unit_id, "Unit")}
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
        sortValue: (row) => entityLabel(row.actor_name, row.actor_id, "User"),
        render: (row) => {
          if (!row.actor_id) return <span className="text-gray-400">—</span>;
          const label = entityLabel(row.actor_name, row.actor_id, "User");
          // LV-SAFETY-POSITION-HISTORY-ACTOR-TOMBSTONE: unresolved actors must not drill.
          if (isUnresolvedEntityTombstone(row.actor_name, row.actor_id, "User")) {
            return (
              <span className="text-gray-600" data-testid="position-history-actor-tombstone">
                {label}
              </span>
            );
          }
          return (
            <span className="text-gray-900">
              <EntityLink kind="user" id={row.actor_id} label={label} data-testid="position-history-actor-link" />
            </span>
          );
        },
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

      <div
        className="flex flex-wrap items-end gap-4 rounded-lg border border-gray-200 bg-white p-4"
        data-testid="position-history-filters"
      >
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700" htmlFor="position-history-unit-filter">
            Unit:
          </label>
          {/* SAF-F14 / picker law: never a raw unit UUID text box — EntityPicker (filter, no +Create). */}
          <EntityPicker
            kind="unit"
            operatingCompanyId={companyId}
            value={draft.unitId || null}
            onChange={(next) => staged.setDraft((d) => ({ ...d, unitId: next ?? "" }))}
            allowCreate={false}
            placeholder="All units"
            className="w-56"
            dataField="position-history-unit-filter"
            dataTestId="position-history-unit-filter"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Action:</label>
          <select
            value={draft.action}
            onChange={(e) =>
              staged.setDraft((d) => ({
                ...d,
                action: e.target.value as ActionFilter,
              }))
            }
            className="rounded-sm border border-gray-300 px-3 py-1.5 text-sm focus:border-slate-300 focus:outline-hidden"
            data-testid="position-history-action-filter"
          >
            <option value="">All</option>
            <option value="installed">Installed</option>
            <option value="removed">Removed</option>
            <option value="replaced">Replaced</option>
          </select>
        </div>

        <Button type="button" size="sm" data-testid="position-history-filter-apply" onClick={staged.apply} disabled={!staged.dirty}>
          Apply
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          data-testid="position-history-filter-cancel"
          onClick={staged.cancel}
          disabled={!staged.dirty}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          data-testid="position-history-filter-reset"
          onClick={() => {
            staged.cancel();
            setApplied(EMPTY_FILTERS);
            patchSearchParam(EMPTY_FILTERS);
            setOffset(0);
          }}
        >
          Reset
        </Button>

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
