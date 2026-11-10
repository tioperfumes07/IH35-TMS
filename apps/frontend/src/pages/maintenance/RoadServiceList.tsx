import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "../../components/Button";
import { StatusBadge } from "../../components/StatusBadge";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { MultiSelectDropdown } from "../../components/forms/MultiSelectDropdown";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { useRoadServiceTickets, type RoadServiceStatus, type RoadServiceTicket } from "../../hooks/useRoadServiceTickets";
import { RoadServiceTicketModal } from "./RoadServiceTicketModal";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";

/** U12 — Status multi-selector (was mutually exclusive All/Open/… pills). */
const STATUS_FILTER_OPTIONS: Array<{ value: RoadServiceStatus; label: string }> = [
  { value: "open", label: "Open" },
  { value: "completed", label: "Completed" },
  { value: "invoiced", label: "Invoiced" },
  { value: "paid", label: "Paid" },
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

const LINK = "text-[#1F2A44] hover:underline";

type Props = {
  operatingCompanyId: string;
};

export function RoadServiceList({ operatingCompanyId }: Props) {
  const { pushToast } = useToast();
  const [searchParams] = useSearchParams();
  const highlightedTicketId = searchParams.get("ticket_id")?.trim() || "";
  // U12: multi-select status — API takes one status; 0 = all; 1 = pass through; 2+ fetch all then filter.
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const staged = useStagedListFilters({
    applied: { statusFilter },
    empty: { statusFilter: [] as string[] },
    onApply: (next) => setStatusFilter(next.statusFilter),
  });
  // Search is ONLY ParityTable UniversalListToolbar (LV-ROAD-SERVICE-DUPLICATE-SEARCH).
  const [createOpen, setCreateOpen] = useState(false);
  const apiStatus =
    statusFilter.length === 1 ? (statusFilter[0] as RoadServiceStatus) : undefined;
  const { tickets, isLoading, createWo } = useRoadServiceTickets({
    status: apiStatus,
  });

  const rows = useMemo(() => {
    if (statusFilter.length <= 1) return tickets;
    const selected = new Set(statusFilter);
    return tickets.filter((row) => selected.has(row.status));
  }, [tickets, statusFilter]);
  const totalCost = useMemo(() => rows.reduce((sum, row) => sum + Number(row.total_cost_cents ?? 0), 0), [rows]);

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
          <Button
            type="button"
            variant="secondary"
            loading={createWo.isPending && createWo.variables === row.id}
            onClick={() =>
              createWo.mutate(row.id, {
                onError: (error) => pushToast(userFacingApiError(error, "Could not create a work order from this ticket"), "error"),
              })
            }
          >
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
          activeFilterCount={statusFilter.length > 0 ? 1 : 0}
          onApply={staged.apply} onReset={staged.reset} onCancel={staged.cancel} applyDisabled={!staged.dirty}
          testIdPrefix="road-service"
        >
          <div className="min-w-[200px]" data-testid="road-service-status-filter">
            <MultiSelectDropdown
              label="Status"
              options={STATUS_FILTER_OPTIONS}
              selected={staged.draft.statusFilter}
              onChange={(next) => staged.setDraft({ statusFilter: next })}
              allLabel="All statuses"
              data-testid="road-service-status-multiselect"
            />
          </div>
        </CollapsedListFilters>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600">Rollup: {money(totalCost)}</span>
          {/* CLS-CHROME-LAW-8: "+ Roadside WO" had no verb at all — relabeled to match the "+
              Create Work Order" convention already used elsewhere on this module. */}
          <Button type="button" onClick={() => setCreateOpen(true)}>
            + Create Roadside WO
          </Button>
        </div>
      </div>

      <ParityTable<RoadServiceTicket>
        title="Roadside service tickets"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        rowClassName={(row) => (highlightedTicketId === row.id ? "bg-[#E5E7EB] ring-1 ring-[#6B7280]" : "")}
        loading={isLoading}
        emptyText="No roadside tickets found."
        storageKey="maint-road-service"
        exportFilename="road-service-tickets"
      />

      <RoadServiceTicketModal open={createOpen} onClose={() => setCreateOpen(false)} operatingCompanyId={operatingCompanyId} />
    </div>
  );
}
