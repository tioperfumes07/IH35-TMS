import { useMemo, useState } from "react";
import { Button } from "../../components/Button";
import { DataTable } from "../../components/DataTable";
import { StatusBadge } from "../../components/StatusBadge";
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
  const [createOpen, setCreateOpen] = useState(false);
  const { disputes, isLoading, reviewDispute } = useSettlementDisputes({
    status: statusFilter === "all" ? undefined : statusFilter,
  });

  const rows = useMemo(() => disputes, [disputes]);

  return (
    <div className="space-y-3" data-testid="settlement-dispute-list">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2" data-testid="dispute-status-filter">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              data-testid={`dispute-status-filter-${filter.id}`}
              onClick={() => setStatusFilter(filter.id)}
              className={`rounded border px-2 py-1 text-xs font-medium ${
                statusFilter === filter.id ? "border-slate-300 bg-slate-100 text-slate-700" : "border-gray-300 bg-white text-gray-700"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          + Create dispute
        </Button>
      </div>

      <DataTable
        rows={rows}
        loading={isLoading}
        rowKey={(row) => row.id}
        columns={[
          { key: "driver_name", label: "Driver", render: (row) => row.driver_name ?? row.driver_id },
          { key: "settlement_display_id", label: "Settlement", render: (row) => row.settlement_display_id ?? row.settlement_id },
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
