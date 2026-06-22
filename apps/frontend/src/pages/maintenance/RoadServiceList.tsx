import { useMemo, useState } from "react";
import { Button } from "../../components/Button";
import { DataTable } from "../../components/DataTable";
import { StatusBadge } from "../../components/StatusBadge";
import { useRoadServiceTickets, type RoadServiceStatus } from "../../hooks/useRoadServiceTickets";
import { RoadServiceTicketModal } from "./RoadServiceTicketModal";

const STATUS_FILTERS: Array<{ id: RoadServiceStatus | "all"; label: string }> = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "completed", label: "Completed" },
  { id: "invoiced", label: "Invoiced" },
  { id: "paid", label: "Paid" },
];

function money(cents: number | null | undefined) {
  return `$${((Number(cents ?? 0) || 0) / 100).toFixed(2)}`;
}

type Props = {
  operatingCompanyId: string;
};

export function RoadServiceList({ operatingCompanyId }: Props) {
  const [statusFilter, setStatusFilter] = useState<RoadServiceStatus | "all">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const { tickets, isLoading, createWo } = useRoadServiceTickets({
    status: statusFilter === "all" ? undefined : statusFilter,
  });

  const rows = useMemo(() => tickets, [tickets]);
  const totalCost = useMemo(() => rows.reduce((sum, row) => sum + Number(row.total_cost_cents ?? 0), 0), [rows]);

  return (
    <div className="space-y-3 px-2" data-testid="road-service-list">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2" data-testid="road-service-status-filter">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              data-testid={`road-service-status-filter-${filter.id}`}
              onClick={() => setStatusFilter(filter.id)}
              className={`rounded border px-2 py-1 text-xs font-medium ${
                statusFilter === filter.id ? "border-slate-600 bg-slate-50 text-slate-800" : "border-gray-300 bg-white text-gray-700"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600">Rollup: {money(totalCost)}</span>
          <Button type="button" onClick={() => setCreateOpen(true)}>
            + New ticket
          </Button>
        </div>
      </div>

      <DataTable
        rows={rows}
        loading={isLoading}
        rowKey={(row) => row.id}
        columns={[
          { key: "ticket_number", label: "Ticket #" },
          { key: "vendor_name", label: "Vendor" },
          { key: "unit_display_id", label: "Unit", render: (row) => row.unit_display_id ?? row.unit_id },
          { key: "service_type", label: "Service" },
          { key: "total_cost_cents", label: "Cost", render: (row) => money(row.total_cost_cents) },
          { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
          {
            key: "actions",
            label: "Actions",
            render: (row) =>
              row.status === "completed" && !row.wo_id ? (
                <Button type="button" variant="secondary" onClick={() => void createWo.mutateAsync(row.id)}>
                  Create WO
                </Button>
              ) : row.wo_id ? (
                <span className="text-xs text-gray-500">WO linked</span>
              ) : null,
          },
        ]}
      />

      <RoadServiceTicketModal open={createOpen} onClose={() => setCreateOpen(false)} operatingCompanyId={operatingCompanyId} />
    </div>
  );
}
