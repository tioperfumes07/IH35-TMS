import { useMemo, useState } from "react";
import { Button } from "../../components/Button";
import { DataTable } from "../../components/DataTable";
import { EntityLink } from "../../components/shared/EntityLink";
import { StatusBadge } from "../../components/StatusBadge";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { entityLabel } from "../../lib/entity-label";
import { useSettlementDisputes, type SettlementDisputeStatus } from "../../hooks/useSettlementDisputes";
import { SettlementDisputeModal } from "./SettlementDisputeModal";

const STATUS_FILTERS: Array<{ id: SettlementDisputeStatus | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "submitted", label: "Submitted" },
  { id: "in_review", label: "In review" },
  { id: "approved", label: "Approved" },
  { id: "denied", label: "Denied" },
  { id: "partial", label: "Partial" },
];

function money(cents: number | null | undefined) {
  return `$${((Number(cents ?? 0) || 0) / 100).toFixed(2)}`;
}

export function SettlementDisputeList() {
  const [statusFilter, setStatusFilter] = useState<SettlementDisputeStatus | "all">("all");
  const staged = useStagedListFilters({ applied: { statusFilter }, empty: { statusFilter: "all" as const }, onApply: (next) => setStatusFilter(next.statusFilter) });
  const [createOpen, setCreateOpen] = useState(false);
  const { disputes, isLoading, reviewDispute } = useSettlementDisputes({
    status: statusFilter === "all" ? undefined : statusFilter,
  });

  const rows = useMemo(() => disputes, [disputes]);

  return (
    <div className="space-y-3" data-testid="settlement-dispute-list">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CollapsedListFilters
          activeFilterCount={statusFilter !== "all" ? 1 : 0}
          onApply={staged.apply}
          onReset={staged.reset}
          onCancel={staged.cancel}
          applyDisabled={!staged.dirty}
          testIdPrefix="dispute"
          dataAttributes={{ "data-settlement-dispute-filter-toolbar": "collapsed" }}
        >
          <div className="flex flex-wrap gap-2" data-testid="dispute-status-filter">
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                data-testid={`dispute-status-filter-${filter.id}`}
                onClick={() => staged.setDraft({ statusFilter: filter.id })}
                className={`rounded border px-2 py-1 text-xs font-medium ${
                  staged.draft.statusFilter === filter.id ? "border-slate-300 bg-slate-100 text-slate-700" : "border-gray-300 bg-white text-gray-700"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </CollapsedListFilters>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          + Create dispute
        </Button>
      </div>

      <DataTable
        rows={rows}
        loading={isLoading}
        rowKey={(row) => row.id}
        columns={[
          {
            key: "driver_name",
            label: "Driver",
            render: (row) => (
              <EntityLink
                kind="driver"
                id={row.driver_id}
                label={entityLabel(row.driver_name, row.driver_id, "Driver")}
              />
            ),
          },
          {
            key: "settlement_display_id",
            label: "Settlement",
            render: (row) => (
              <EntityLink
                kind="settlement"
                id={row.settlement_id}
                label={entityLabel(row.settlement_display_id, row.settlement_id, "Settlement")}
              />
            ),
          },
          { key: "dispute_type", label: "Type" },
          { key: "claimed_amount_cents", label: "Claimed", render: (row) => money(row.claimed_amount_cents) },
          { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
          {
            key: "actions",
            label: "Actions",
            render: (row) =>
              row.status === "submitted" ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    void reviewDispute({
                      id: row.id,
                      status: "in_review",
                      resolution_notes: "Marked in review from drivers disputes tab",
                    })
                  }
                >
                  Start review
                </Button>
              ) : null,
          },
        ]}
      />

      <SettlementDisputeModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
