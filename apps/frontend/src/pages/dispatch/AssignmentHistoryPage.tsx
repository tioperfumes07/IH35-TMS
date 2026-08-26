import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel, isUnresolvedEntityTombstone /* LV-DISPATCH-ASSIGNMENT-HISTORY-TOMBSTONE */ } from "../../lib/entity-label";
import { useQuery } from "@tanstack/react-query";
import { DatePicker } from "../../components/forms/DatePicker";
import { useState } from "react";
import { Link } from "react-router-dom";
import { listDispatchAssignmentHistory } from "../../api/dispatch";
import { Button } from "../../components/Button";
import { ListErrorState } from "../../components/ListErrorState";
import { PageHeader } from "../../components/layout/PageHeader";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { EntityPicker } from "../../components/parity/EntityPicker";
import { formatQueryErrorDetail } from "../../lib/tableError";
import { useStagedListFilters } from "../../components/table";

type Filters = {
  driverId: string;
  from: string;
  to: string;
  reason: string;
};

const EMPTY_FILTERS: Filters = { driverId: "", from: "", to: "", reason: "" };

export function AssignmentHistoryPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  // LV-DISPATCH-ASSIGNMENT-HISTORY-FILTER-NO-CANCEL — draft/applied via useStagedListFilters;
  // Apply commits, Cancel restores draft to applied, Reset clears both (filter/gear law).
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const staged = useStagedListFilters({
    applied,
    empty: EMPTY_FILTERS,
    onApply: setApplied,
  });
  const draft = staged.draft;
  const setDraft = staged.setDraft;

  const historyQ = useQuery({
    queryKey: [
      "dispatch",
      "assignment-history-global",
      companyId,
      applied.driverId,
      applied.from,
      applied.to,
      applied.reason,
    ],
    queryFn: () =>
      listDispatchAssignmentHistory(companyId, {
        driver_id: applied.driverId.trim() || undefined,
        from: applied.from || undefined,
        to: applied.to || undefined,
        reason: applied.reason.trim() || undefined,
      }),
    enabled: Boolean(companyId),
  });

  if (!companyId) {
    return <div className="rounded-sm border bg-white p-4 text-sm text-slate-600">Select an operating company.</div>;
  }

  const rows = historyQ.data?.rows ?? [];
  type AssignmentHistoryRow = (typeof rows)[number];

  const columns: Array<ParityColumn<AssignmentHistoryRow>> = [
    { key: "assigned_at", label: "Assigned at", sortable: true, render: (row) => new Date(row.assigned_at).toLocaleString() },
    {
      key: "load_number",
      label: "Load",
      sortable: true,
render: (row) => {
        if (!row.load_id) return <span className="text-slate-400">—</span>;
        const label = entityLabel(row.load_number, row.load_id, "Load");
        if (isUnresolvedEntityTombstone(row.load_number, row.load_id, "Load")) {
          return <span className="text-slate-600" data-testid="assignment-history-load-tombstone">{label}</span>;
        }
        return <EntityLink kind="load" id={row.load_id} label={label} data-testid="assignment-history-load-link" />;
      },
    },
    { key: "assignment_method", label: "Method", sortable: true },
    {
      key: "previous_driver_name",
      label: "Previous driver",
render: (row) => {
        if (!row.previous_driver_id) return <span className="text-slate-400">—</span>;
        const label = entityLabel(row.previous_driver_name, row.previous_driver_id, "Driver");
        if (isUnresolvedEntityTombstone(row.previous_driver_name, row.previous_driver_id, "Driver")) {
          return <span className="text-slate-600" data-testid="assignment-history-prev-driver-tombstone">{label}</span>;
        }
        return <EntityLink kind="driver" id={row.previous_driver_id} label={label} data-testid="assignment-history-prev-driver-link" />;
      },
    },
    {
      key: "new_driver_name",
      label: "New driver",
render: (row) => {
        if (!row.new_driver_id) return <span className="text-slate-400">—</span>;
        const label = entityLabel(row.new_driver_name, row.new_driver_id, "Driver");
        if (isUnresolvedEntityTombstone(row.new_driver_name, row.new_driver_id, "Driver")) {
          return <span className="text-slate-600" data-testid="assignment-history-new-driver-tombstone">{label}</span>;
        }
        return <EntityLink kind="driver" id={row.new_driver_id} label={label} data-testid="assignment-history-new-driver-link" />;
      },
    },
    {
      key: "previous_unit_number",
      label: "Previous unit",
render: (row) => {
        if (!row.previous_unit_id) return <span className="text-slate-400">—</span>;
        const label = entityLabel(row.previous_unit_number, row.previous_unit_id, "Unit");
        if (isUnresolvedEntityTombstone(row.previous_unit_number, row.previous_unit_id, "Unit")) {
          return <span className="text-slate-600" data-testid="assignment-history-prev-unit-tombstone">{label}</span>;
        }
        return <EntityLink kind="unit" id={row.previous_unit_id} label={label} data-testid="assignment-history-prev-unit-link" />;
      },
    },
    {
      key: "new_unit_number",
      label: "New unit",
render: (row) => {
        if (!row.new_unit_id) return <span className="text-slate-400">—</span>;
        const label = entityLabel(row.new_unit_number, row.new_unit_id, "Unit");
        if (isUnresolvedEntityTombstone(row.new_unit_number, row.new_unit_id, "Unit")) {
          return <span className="text-slate-600" data-testid="assignment-history-new-unit-tombstone">{label}</span>;
        }
        return <EntityLink kind="unit" id={row.new_unit_id} label={label} data-testid="assignment-history-new-unit-link" />;
      },
    },
    { key: "reason_code", label: "Reason", render: (row) => row.reason_code ?? row.notes ?? "—" },
  ];

  return (
    <div data-testid="dispatch-assignment-history-page" className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title="Assignment History"
        subtitle="Load driver and unit reassignment audit trail"
        actions={
          <Link to="/dispatch" className="rounded-sm border px-3 py-1.5 text-sm">
            Dispatch Home
          </Link>
        }
      />

      <section
        data-testid="assignment-history-filters"
        className="grid gap-3 rounded-sm border bg-white p-4 md:grid-cols-4"
      >
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">Driver</label>
          <EntityPicker
            kind="driver"
            operatingCompanyId={companyId}
            value={draft.driverId || null}
            onChange={(next) => setDraft((d) => ({ ...d, driverId: next ?? "" }))}
            // Universal picker law (V2): + Add new / Create Driver must be first row — do not disable create on this filter.
            allowCreate
            placeholder="All drivers"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="assignment-history-from" className="text-xs font-semibold text-gray-600">
            From
          </label>
          {/* Layout-only className — DatePicker owns the single border (no box-in-box). */}
          <DatePicker
            id="assignment-history-from"
            value={draft.from}
            onChange={(next) => setDraft((d) => ({ ...d, from: next }))}
            className="w-full"
            data-testid="assignment-history-from-date"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="assignment-history-to" className="text-xs font-semibold text-gray-600">
            To
          </label>
          <DatePicker
            id="assignment-history-to"
            value={draft.to}
            onChange={(next) => setDraft((d) => ({ ...d, to: next }))}
            className="w-full"
            data-testid="assignment-history-to-date"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">Reason contains</label>
          <input
            value={draft.reason}
            onChange={(event) => setDraft((d) => ({ ...d, reason: event.target.value }))}
            className="h-9 rounded-sm border border-gray-300 px-2 text-[13px]"
          />
        </div>
        <div className="md:col-span-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            data-testid="assignment-history-filter-reset"
            onClick={staged.reset}
          >
            Reset
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            data-testid="assignment-history-filter-cancel"
            onClick={staged.cancel}
            disabled={!staged.dirty}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            data-testid="assignment-history-filter-apply"
            onClick={staged.apply}
            disabled={!staged.dirty}
          >
            Apply
          </Button>
        </div>
      </section>

      {historyQ.isError ? (
        <ListErrorState
          title="Couldn't load assignment history"
          {...formatQueryErrorDetail(historyQ.error)}
          onRetry={() => void historyQ.refetch()}
        />
      ) : (
        <ParityTable<AssignmentHistoryRow>
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          loading={historyQ.isLoading}
          emptyText="No assignment history for current filters."
          storageKey="dispatch-assignment-history"
          exportFilename="assignment-history"
        />
      )}

      <div className="flex justify-end">
        <Button size="sm" variant="secondary" onClick={() => void historyQ.refetch()}>
          Refresh
        </Button>
      </div>
    </div>
  );
}
