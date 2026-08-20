import { useQuery } from "@tanstack/react-query";
import { DatePicker } from "../../components/forms/DatePicker";
import { useState } from "react";
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

type Props = {
  driverId: string;
  operatingCompanyId: string;
};

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
    key: "created_at",
    label: "Created",
    sortable: true,
    render: (row) => (row.created_at ? new Date(row.created_at).toLocaleString() : "—"),
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
    render: (row) => new Date(row.assigned_at).toLocaleString(),
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

/**
 * Load History tab = (1) canonical assigned loads reverse + (2) assignment-change log.
 * Assignment events alone are not load history.
 */
export function LoadHistoryTab({ driverId, operatingCompanyId }: Props) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const assignedQ = useQuery({
    queryKey: ["driver-assigned-loads", driverId, operatingCompanyId],
    queryFn: () => listDriverAssignedLoads(driverId, operatingCompanyId, { limit: 50 }),
    enabled: Boolean(driverId) && Boolean(operatingCompanyId),
  });

  const historyQ = useQuery({
    queryKey: ["driver-load-history", driverId, operatingCompanyId, fromDate, toDate],
    queryFn: () =>
      listDispatchAssignmentHistory(operatingCompanyId, {
        driver_id: driverId,
        from: fromDate || undefined,
        to: toDate || undefined,
      }),
    enabled: Boolean(driverId) && Boolean(operatingCompanyId),
  });

  const assignedRows = assignedQ.data?.loads ?? [];
  const historyRows = historyQ.data?.rows ?? [];

  return (
    <div className="space-y-6" data-testid="driver-load-history-tab">
      <section className="space-y-3" data-testid="driver-assigned-loads">
        <div>
          <h3 className="text-[14px] font-semibold text-slate-800">Assigned loads</h3>
          <p className="text-[12px] text-slate-600">Loads where this driver is primary or co-driver (canonical reverse).</p>
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
            rows={assignedRows}
            rowKey={(row) => row.id}
            loading={assignedQ.isLoading}
            emptyText="No assigned loads for this driver."
            storageKey="driver-assigned-loads"
            tableTestId="driver-assigned-loads-table"
            rowTestId={(row) => `driver-assigned-load-row-${row.id}`}
          />
        )}
      </section>

      <section className="space-y-3" data-testid="driver-assignment-change-log">
        <div>
          <h3 className="text-[14px] font-semibold text-slate-800">Assignment change log</h3>
          <p className="text-[12px] text-slate-600">Dispatch reassignment events (who was moved on/off a load).</p>
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
            filterBar={
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs text-gray-600">
                  From
                  <DatePicker
                    className="mt-1 block"
                    value={fromDate}
                    onChange={(next) => setFromDate(next)}
                    data-testid="driver-load-history-filter-from"
                  />
                </label>
                <label className="text-xs text-gray-600">
                  To
                  <DatePicker
                    className="mt-1 block"
                    value={toDate}
                    onChange={(next) => setToDate(next)}
                    data-testid="driver-load-history-filter-to"
                  />
                </label>
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
      </section>
    </div>
  );
}
