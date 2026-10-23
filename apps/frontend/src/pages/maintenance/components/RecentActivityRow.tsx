import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { WorkOrder } from "../../../api/maintenance";
import { Button } from "../../../components/Button";
import { entityLabel } from "../../../lib/entity-label";
import { EntityLink } from "../../../components/shared/EntityLink";
import { EntityLinkOrTombstone } from "../../../components/shared/EntityLinkOrTombstone";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { formatDateUS } from "../../../lib/formatDate";

type Props = {
  recent: WorkOrder[];
  completed: WorkOrder[];
  recentTotalCount: number;
  completedTotalCount: number;
  pageSize: number;
  recentPage: number;
  completedPage: number;
  fetching: boolean;
  onRecentPageChange: (page: number) => void;
  onCompletedPageChange: (page: number) => void;
  onOpen: (id: string) => void;
};

function money(value: unknown) {
  return value == null ? "Unavailable" : Number(value).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function Table({
  title,
  rows,
  totalCount,
  page,
  pageSize,
  fetching,
  onPageChange,
  onOpen,
  storageKey,
}: {
  title: string;
  rows: WorkOrder[];
  totalCount: number;
  page: number;
  pageSize: number;
  fetching: boolean;
  onPageChange: (page: number) => void;
  onOpen: (id: string) => void;
  storageKey: string;
}) {
  const columns = useMemo<ParityColumn<WorkOrder>[]>(
    () => [
      {
        key: "display_id",
        label: "WO #",
        sortable: true,
        render: (row) => (
          <EntityLink kind="work_order" id={row.id} label={entityLabel(row.display_id, row.id, "Work order")} className="text-xs font-semibold text-gray-800" onClick={(event) => { event.preventDefault(); onOpen(row.id); }} />
        ),
      },
      { key: "source_type", label: "Source", sortable: true, render: (row) => row.source_type ?? "—" },
      { key: "description", label: "Job", render: (row) => row.description || "—" },
      { key: "closed_at", label: "Closed", sortable: true, render: (row) => formatDateUS(row.closed_at) || "—" },
      { key: "duration_seconds", label: "Downtime", render: (row) => row.duration_seconds == null ? "Unavailable" : `${(row.duration_seconds / 3600).toLocaleString("en-US", { maximumFractionDigits: 1 })} h` },
      {
        key: "unit_number",
        label: "Unit",
        sortable: true,
        render: (row) => <EntityLinkOrTombstone kind="unit" id={row.unit_id} name={row.unit_number} noun="Unit" />,
      },
      {
        key: "driver_id",
        label: "Driver",
        render: (row) => (
          <EntityLinkOrTombstone kind="driver" id={row.driver_id ?? undefined} name={row.driver_name} noun="Driver" />
        ),
      },
      {
        key: "resolved_vendor_id",
        label: "Vendor",
        render: (row) =>
          row.resolved_vendor_id ? (
            <EntityLinkOrTombstone
              kind="vendor"
              id={row.resolved_vendor_id}
              name={row.resolved_vendor_name}
              noun="Vendor"
            />
          ) : (
            "—"
          ),
      },
      { key: "status", label: "Status", sortable: true, render: (row) => row.status ?? "—" },
      {
        key: "total_actual_cost",
        label: "Total Cost",
        numeric: true,
        render: (row) => <EntityLink kind="work_order" id={row.id} label={money((row as Record<string, unknown>).total_actual_cost)} onClick={(event) => { event.preventDefault(); onOpen(row.id); }} />,
      },
      {
        key: "opened_at",
        label: "Opened",
        sortable: true,
        render: (row) => formatDateUS(row.opened_at) || "—",
      },
      {
        key: "action",
        label: "Action",
        render: (row) => (
          <Button type="button" variant="secondary" size="sm" onClick={() => onOpen(row.id)}>
            Open
          </Button>
        ),
      },
    ],
    [onOpen],
  );

  return (
    <div className="rounded-sm border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-2 py-1 text-xs font-semibold text-gray-600"><h3>{title}</h3><div className="flex flex-wrap items-center gap-2">{title === "Recent Work Orders" ? <Link to="/maintenance?create_wo=1">+ Create Work Order</Link> : null}<Link to={title === "Recently Completed" ? "/maintenance/active-wos?status=complete" : "/maintenance/active-wos"}>View all →</Link></div></div>
      <div>
        {totalCount > rows.length ? (
          <div className="border-b border-gray-100 px-2 py-1 text-xs text-[#6B7280]" data-testid="maintenance-recent-activity-range">
            {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalCount)} of {totalCount} work orders.
          </div>
        ) : null}
        <ParityTable
          title="Recent work order activity"
          rows={rows}
          columns={(() => {
            const visible = title === "Recently Completed"
              ? ["display_id", "unit_number", "closed_at", "total_actual_cost", "duration_seconds"]
              : ["display_id", "unit_number", "opened_at", "description", "status"];
            return [
              ...visible.map((key) => columns.find((column) => column.key === key)!),
              ...columns.filter((column) => !visible.includes(String(column.key))).map((column) => ({ ...column, defaultHidden: true })),
            ];
          })()}
          rowKey={(row) => row.id}
          loading={fetching && rows.length === 0}
          storageKey={storageKey}
          emptyText="No entries."
        />
        {totalCount > pageSize ? (
          <div className="flex justify-end gap-2 border-t border-gray-100 px-2 py-1 text-xs" data-testid={`maintenance-${title.toLowerCase().replace(/\s+/g, "-")}-pager`}>
            <button type="button" disabled={page === 0 || fetching} onClick={() => onPageChange(Math.max(0, page - 1))}>Previous</button>
            <button type="button" disabled={(page + 1) * pageSize >= totalCount || fetching} onClick={() => onPageChange(page + 1)}>Next</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function RecentActivityRow({ recent, completed, recentTotalCount, completedTotalCount, pageSize, recentPage, completedPage, fetching, onRecentPageChange, onCompletedPageChange, onOpen }: Props) {
  return (
    <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
      <Table title="Recent Work Orders" rows={recent} totalCount={recentTotalCount} page={recentPage} pageSize={pageSize} fetching={fetching} onPageChange={onRecentPageChange} onOpen={onOpen} storageKey="maint-home-recent-wos" />
      <Table title="Recently Completed" rows={completed} totalCount={completedTotalCount} page={completedPage} pageSize={pageSize} fetching={fetching} onPageChange={onCompletedPageChange} onOpen={onOpen} storageKey="maint-home-completed-wos" />
    </div>
  );
}
