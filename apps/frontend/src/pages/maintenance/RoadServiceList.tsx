import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "../../components/Button";
import { StatusBadge } from "../../components/StatusBadge";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { useRoadServiceTickets, type RoadServiceStatus, type RoadServiceTicket } from "../../hooks/useRoadServiceTickets";
import { RoadServiceTicketModal } from "./RoadServiceTicketModal";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";

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

function calloutAt(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const LINK = "text-slate-700 hover:underline";

type Props = {
  operatingCompanyId: string;
};

export function RoadServiceList({ operatingCompanyId }: Props) {
  const [searchParams] = useSearchParams();
  const highlightedTicketId = searchParams.get("ticket_id")?.trim() || "";
  const [statusFilter, setStatusFilter] = useState<RoadServiceStatus | "all">("all");
  const staged = useStagedListFilters({ applied: { statusFilter }, empty: { statusFilter: "all" as const }, onApply: (next) => setStatusFilter(next.statusFilter) });
  // Search is ONLY ParityTable UniversalListToolbar (LV-ROAD-SERVICE-DUPLICATE-SEARCH).
  const [createOpen, setCreateOpen] = useState(false);
  const { tickets, isLoading, createWo } = useRoadServiceTickets({
    status: statusFilter === "all" ? undefined : statusFilter,
  });

  const rows = tickets;
  const totalCost = useMemo(() => tickets.reduce((sum, row) => sum + Number(row.total_cost_cents ?? 0), 0), [tickets]);

  // Universal-list columns (spec 02 Road Service) — every record cell links to its detail per 00-MASTER-LINK-MAP.
  const columns: Array<ParityColumn<RoadServiceTicket>> = [
    {
      key: "ticket_number",
      label: "WO / Ticket #",
      sortable: true,
      render: (row) =>
        row.wo_id ? (
          <EntityLinkOrTombstone
            kind="work_order"
            id={row.wo_id}
            name={row.work_order_display_id}
            noun="Work order"
            className={LINK}
            data-testid="road-service-wo-link"
          />
        ) : (
          <span className="font-medium">{row.ticket_number}</span>
        ),
    },
    {
      key: "unit_display_id",
      label: "Unit",
      sortable: true,
      render: (row) => (
        <EntityLinkOrTombstone kind="unit" id={row.unit_id} name={row.unit_display_id} noun="Unit" className={LINK} />
      ),
    },
    {
      key: "driver_name",
      label: "Driver",
      render: (row) => <EntityLinkOrTombstone kind="driver" id={row.driver_id} name={row.driver_name} noun="Driver" className={LINK} />,
    },
    { key: "location_address", label: "Location", render: (row) => row.location_address ?? "—" },
    {
      key: "vendor_name",
      label: "Provider",
      sortable: true,
      render: (row) => <EntityLinkOrTombstone kind="vendor" id={row.vendor_id} name={row.vendor_name} noun="Vendor" className={LINK} />,
    },
    { key: "service_type", label: "Service", sortable: true },
    { key: "created_at", label: "Callout", sortable: true, render: (row) => calloutAt(row.created_at) },
    // ETA / RESPONSE (road-service.html) — real on_scene_time arrival column, previously unrendered. "—" until
    // the provider is marked on-scene (no fabrication — it's a genuine nullable timestamp).
    { key: "on_scene_time", label: "ETA / Response", sortable: true, render: (row) => calloutAt(row.on_scene_time) },
    { key: "total_cost_cents", label: "Cost", sortable: true, render: (row) => money(row.total_cost_cents) },
    { key: "status", label: "Status", sortable: true, render: (row) => <StatusBadge status={row.status} /> },
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
  ];

  return (
    <div className="space-y-3 px-2" data-testid="road-service-list">
      <div className="flex flex-wrap items-center justify-between gap-2" data-road-service-filter-toolbar="collapsed">
        <CollapsedListFilters
          activeFilterCount={statusFilter !== "all" ? 1 : 0}
          onApply={staged.apply} onReset={staged.reset} onCancel={staged.cancel} applyDisabled={!staged.dirty}
          testIdPrefix="road-service"
        >
          <div className="flex flex-wrap gap-2" data-testid="road-service-status-filter">
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                data-testid={`road-service-status-filter-${filter.id}`}
                onClick={() => staged.setDraft({ statusFilter: filter.id })}
                className={`rounded border px-2 py-1 text-xs font-medium ${
                  statusFilter === filter.id
                    ? "border-slate-600 bg-slate-50 text-slate-800"
                    : "border-gray-300 bg-white text-gray-700"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </CollapsedListFilters>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600">Rollup: {money(totalCost)}</span>
          <Button type="button" onClick={() => setCreateOpen(true)}>
            + Roadside WO
          </Button>
        </div>
      </div>

      <ParityTable<RoadServiceTicket>
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        rowClassName={(row) => (highlightedTicketId === row.id ? "bg-slate-100 ring-1 ring-slate-400" : "")}
        loading={isLoading}
        emptyText="No roadside tickets found."
        storageKey="maint-road-service"
        exportFilename="road-service-tickets"
      />

      <RoadServiceTicketModal open={createOpen} onClose={() => setCreateOpen(false)} operatingCompanyId={operatingCompanyId} />
    </div>
  );
}
