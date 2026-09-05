import { useQuery } from "@tanstack/react-query";
import { DatePicker } from "../../components/forms/DatePicker";
import { useEffect, useMemo, useState } from "react";
import {
  listDispatchAssignmentHistory,
  type DispatchAssignmentHistoryRow,
} from "../../api/dispatch";
import { listDriverAssignedLoads, type DriverAssignedLoad } from "../../api/mdata";
import { Button } from "../Button";
import { ListErrorState } from "../ListErrorState";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";
import { EntityLink } from "../shared/EntityLink";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { entityLabel } from "../../lib/entity-label";
import { formatUsdCents } from "../../lib/money";
import { mmmDd } from "../../lib/formatDate";

type Props = {
  driverId: string;
  operatingCompanyId: string;
};

/** Status filter groups — the backend ?status= param accepts comma-separated load_status_enum values. */
const STATUS_FILTER_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "All", value: "" },
  { label: "Open", value: "draft,booked,planned,unassigned,assigned,assigned_not_dispatched,dispatched,at_pickup,in_transit,at_delivery" },
  { label: "Dispatched", value: "dispatched" },
  { label: "Delivered", value: "delivered,delivered_pending_docs,completed_docs_received" },
  { label: "Cancelled", value: "cancelled,abandoned,driver_walkoff,driver_no_show" },
  { label: "Invoiced", value: "invoiced,paid,closed" },
];

const ASSIGNED_COLUMNS: Array<ParityColumn<DriverAssignedLoad>> = [
  {
    key: "load_number",
    label: "Load #",
    sortable: true,
    render: (row) => (
      <EntityLink kind="load" id={row.id} label={entityLabel(row.load_number, row.id, "Load")} data-testid={`driver-assigned-load-${row.id}`} />
    ),
  },
  { key: "status", label: "Status", sortable: true },
  {
    key: "customer_name",
    label: "Customer",
    sortable: true,
    render: (row) => (
      <EntityLinkOrTombstone
        kind="customer"
        id={row.customer_id}
        name={row.customer_name}
        noun="Customer"
      />
    ),
  },
  {
    key: "assigned_unit_number",
    label: "Unit",
    sortable: true,
    render: (row) => (
      <EntityLinkOrTombstone
        kind="unit"
        id={row.assigned_unit_id}
        name={row.assigned_unit_number}
        noun="Unit"
      />
    ),
  },
  {
    key: "rate_total_cents",
    label: "Rate",
    sortable: true,
    render: (row) => (row.rate_total_cents == null ? "—" : formatUsdCents(row.rate_total_cents)),
    exportValue: (row) => (row.rate_total_cents == null ? "" : formatUsdCents(row.rate_total_cents)),
  },
  {
    key: "first_pickup_city",
    label: "Pickup City",
    sortable: true,
    render: (row) => row.first_pickup_city ?? "—",
  },
  {
    key: "first_delivery_city",
    label: "Delivery City",
    sortable: true,
    render: (row) => row.first_delivery_city ?? "—",
  },
  {
    key: "created_at",
    label: "Created",
    sortable: true,
    render: (row) => (row.created_at ? mmmDd(row.created_at) : "—"),
    exportValue: (row) => (row.created_at ? mmmDd(row.created_at) : ""),
  },
];

const HISTORY_COLUMNS: Array<ParityColumn<DispatchAssignmentHistoryRow>> = [
  {
    key: "load_number",
    label: "Load #",
    sortable: true,
    render: (row) => (
      <EntityLink
        kind="load"
        id={row.load_id}
        label={entityLabel(row.load_number, row.load_id, "Load")}
        data-testid={`driver-load-history-load-${row.id}`}
      />
    ),
  },
  {
    key: "assigned_at",
    label: "Assigned At",
    sortable: true,
    render: (row) => (row.assigned_at ? mmmDd(row.assigned_at) : "—"),
  },
  { key: "assignment_method", label: "Method", sortable: true },
  {
    key: "previous_driver_name",
    label: "Previous Driver",
    sortable: true,
    render: (row) => (
      <EntityLinkOrTombstone
        kind="driver"
        id={row.previous_driver_id}
        name={row.previous_driver_name}
        noun="Driver"
        data-testid={`driver-load-history-prev-driver-${row.id}`}
      />
    ),
  },
  {
    key: "new_driver_name",
    label: "New Driver",
    sortable: true,
    render: (row) => (
      <EntityLinkOrTombstone
        kind="driver"
        id={row.new_driver_id}
        name={row.new_driver_name}
        noun="Driver"
        data-testid={`driver-load-history-new-driver-${row.id}`}
      />
    ),
  },
  {
    key: "reason_code",
    label: "Reason",
    sortable: true,
    render: (row) => row.reason_code ?? row.notes ?? "—",
  },
];

function csvEscape(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Load History tab = (1) canonical assigned loads reverse + (2) assignment-change log.
 * Assignment events alone are not load history.
 */
export function LoadHistoryTab({ driverId, operatingCompanyId }: Props) {
  const assignedPageSize = 50;
  const [assignedPage, setAssignedPage] = useState(1);
  const historyPageSize = 50;
  const [historyPage, setHistoryPage] = useState(1);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [assignedFromDate, setAssignedFromDate] = useState("");
  const [assignedToDate, setAssignedToDate] = useState("");

  useEffect(() => setAssignedPage(1), [driverId, operatingCompanyId, statusFilter]);
  useEffect(() => setHistoryPage(1), [driverId, operatingCompanyId, fromDate, toDate]);

  const assignedQ = useQuery({
    queryKey: ["driver-assigned-loads", driverId, operatingCompanyId, assignedPage, statusFilter],
    queryFn: () => listDriverAssignedLoads(driverId, operatingCompanyId, {
      limit: assignedPageSize,
      offset: (assignedPage - 1) * assignedPageSize,
      status: statusFilter || undefined,
    }),
    enabled: Boolean(driverId) && Boolean(operatingCompanyId),
  });

  const historyQ = useQuery({
    queryKey: ["driver-load-history", driverId, operatingCompanyId, fromDate, toDate, historyPage],
    queryFn: () =>
      listDispatchAssignmentHistory(operatingCompanyId, {
        driver_id: driverId,
        from: fromDate || undefined,
        to: toDate || undefined,
        limit: historyPageSize,
        offset: (historyPage - 1) * historyPageSize,
      }),
    enabled: Boolean(driverId) && Boolean(operatingCompanyId),
  });

  const assignedRows = assignedQ.isError ? [] : assignedQ.data?.loads ?? [];
  const assignedTotal = assignedQ.isError ? 0 : assignedQ.data?.total_count ?? 0;
  const assignedPageCount = Math.max(1, Math.ceil(assignedTotal / assignedPageSize));

  // Client-side date range filter for assigned loads (backend doesn't support date filtering yet).
  const filteredAssignedRows = useMemo(() => {
    if (!assignedFromDate && !assignedToDate) return assignedRows;
    return assignedRows.filter((row) => {
      if (!row.created_at) return false;
      const created = row.created_at.slice(0, 10);
      if (assignedFromDate && created < assignedFromDate) return false;
      if (assignedToDate && created > assignedToDate) return false;
      return true;
    });
  }, [assignedRows, assignedFromDate, assignedToDate]);

  const historyRows = historyQ.isError ? [] : historyQ.data?.rows ?? [];
  const historyTotal = historyQ.isError ? 0 : historyQ.data?.total_count ?? 0;
  const historyPageCount = Math.max(1, Math.ceil(historyTotal / historyPageSize));

  function exportCsv() {
    const headers = ["Load #", "Status", "Customer", "Unit", "Rate", "Pickup City", "Delivery City", "Created"];
    const rows = filteredAssignedRows.map((row) => [
      row.load_number ?? "",
      row.status ?? "",
      row.customer_name ?? "",
      row.assigned_unit_number ?? "",
      row.rate_total_cents == null ? "" : formatUsdCents(row.rate_total_cents),
      row.first_pickup_city ?? "",
      row.first_delivery_city ?? "",
      row.created_at ? mmmDd(row.created_at) : "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "driver-assigned-loads.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6" data-testid="driver-load-history-tab">
      <section className="space-y-3" data-testid="driver-assigned-loads">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-xs font-semibold text-slate-800">Assigned loads</h3>
            <p className="text-xs text-slate-600">Loads where this driver is primary or co-driver (canonical reverse).</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={exportCsv} className="rounded-sm border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">Export CSV</button>
            <button type="button" onClick={() => window.print()} className="rounded-sm border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">Print</button>
          </div>
        </div>
        {assignedQ.isError ? (
          <ListErrorState
            title="Couldn't load assigned loads"
            status={0}
            message={(assignedQ.error as Error)?.message}
            onRetry={() => void assignedQ.refetch()}
          />
        ) : (
          <ParityTable
            columns={ASSIGNED_COLUMNS}
            rows={filteredAssignedRows}
            rowKey={(row) => row.id}
            loading={assignedQ.isLoading}
            emptyText="No assigned loads for this driver."
            storageKey="driver-assigned-loads"
            tableTestId="driver-assigned-loads-table"
            rowTestId={(row) => `driver-assigned-load-row-${row.id}`}
            pageSize={assignedPageSize}
            pageSizeOptions={[assignedPageSize]}
            hidePager
            filterBar={
              <div className="flex flex-wrap items-end gap-2">
                <div className="text-xs text-gray-600">
                  <label htmlFor="driver-assigned-loads-status-filter" className="block">Status</label>
                  <select
                    id="driver-assigned-loads-status-filter"
                    className="mt-1 rounded-sm border border-gray-300 bg-white px-2 py-1 text-xs"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    data-testid="driver-assigned-loads-status-filter"
                  >
                    {STATUS_FILTER_OPTIONS.map((opt) => (
                      <option key={opt.label} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="text-xs text-gray-600">
                  <label htmlFor="driver-assigned-loads-filter-from">From</label>
                  <DatePicker
                    id="driver-assigned-loads-filter-from"
                    className="mt-1 block"
                    value={assignedFromDate}
                    onChange={(next) => setAssignedFromDate(next)}
                    data-testid="driver-assigned-loads-filter-from"
                  />
                </div>
                <div className="text-xs text-gray-600">
                  <label htmlFor="driver-assigned-loads-filter-to">To</label>
                  <DatePicker
                    id="driver-assigned-loads-filter-to"
                    className="mt-1 block"
                    value={assignedToDate}
                    onChange={(next) => setAssignedToDate(next)}
                    data-testid="driver-assigned-loads-filter-to"
                  />
                </div>
              </div>
            }
          />
        )}
        {!assignedQ.isError && assignedTotal > assignedPageSize ? (
          <div className="flex items-center justify-end gap-2 text-xs" data-testid="driver-assigned-loads-server-pager">
            <Button
              size="sm"
              variant="secondary"
              disabled={assignedPage <= 1 || assignedQ.isFetching}
              onClick={() => setAssignedPage((page) => Math.max(1, page - 1))}
            >
              Previous
            </Button>
            <span className="text-gray-600">Page {assignedPage} of {assignedPageCount} · {assignedTotal} loads</span>
            <Button
              size="sm"
              variant="secondary"
              disabled={assignedPage >= assignedPageCount || assignedQ.isFetching}
              onClick={() => setAssignedPage((page) => Math.min(assignedPageCount, page + 1))}
            >
              Next
            </Button>
          </div>
        ) : null}
      </section>

      <section className="space-y-3" data-testid="driver-assignment-change-log">
        <div>
          <h3 className="text-xs font-semibold text-slate-800">Assignment change log</h3>
          <p className="text-xs text-slate-600">Dispatch reassignment events (who was moved on/off a load).</p>
        </div>
        {historyQ.isError ? (
          <div data-testid="driver-load-history-error">
            <ListErrorState
              title="Couldn't load assignment history"
              status={0}
              message={(historyQ.error as Error)?.message}
              onRetry={() => void historyQ.refetch()}
            />
          </div>
        ) : (
          <ParityTable
            columns={HISTORY_COLUMNS}
            rows={historyRows}
            rowKey={(row) => row.id}
            loading={historyQ.isLoading}
            emptyText="No load assignment history for this driver."
            storageKey="driver-load-history"
            tableTestId="driver-load-history-table"
            rowTestId={(row) => `driver-load-history-row-${row.id}`}
            pageSize={historyPageSize}
            pageSizeOptions={[historyPageSize]}
            hidePager
            filterBar={
              <div className="flex flex-wrap items-end gap-2">
                <div className="text-xs text-gray-600">
                  <label htmlFor="driver-load-history-filter-from">From</label>
                  <DatePicker
                    id="driver-load-history-filter-from"
                    className="mt-1 block"
                    value={fromDate}
                    onChange={(next) => setFromDate(next)}
                    data-testid="driver-load-history-filter-from"
                  />
                </div>
                <div className="text-xs text-gray-600">
                  <label htmlFor="driver-load-history-filter-to">To</label>
                  <DatePicker
                    id="driver-load-history-filter-to"
                    className="mt-1 block"
                    value={toDate}
                    onChange={(next) => setToDate(next)}
                    data-testid="driver-load-history-filter-to"
                  />
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  data-testid="driver-load-history-refresh"
                  onClick={() => void historyQ.refetch()}
                >
                  Refresh
                </Button>
              </div>
            }
          />
        )}
        {!historyQ.isError && historyTotal > historyPageSize ? (
          <div className="flex items-center justify-end gap-2 text-xs" data-testid="driver-load-history-server-pager">
            <Button size="sm" variant="secondary" disabled={historyPage <= 1 || historyQ.isFetching} onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}>
              Previous
            </Button>
            <span className="text-gray-600">Page {historyPage} of {historyPageCount} · {historyTotal} changes</span>
            <Button size="sm" variant="secondary" disabled={historyPage >= historyPageCount || historyQ.isFetching} onClick={() => setHistoryPage((page) => Math.min(historyPageCount, page + 1))}>
              Next
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
