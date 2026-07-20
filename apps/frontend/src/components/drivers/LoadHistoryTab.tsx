import { useQuery } from "@tanstack/react-query";
import { DatePicker } from "../../components/forms/DatePicker";
import { useState } from "react";
import {
  listDispatchAssignmentHistory,
  type DispatchAssignmentHistoryRow,
} from "../../api/dispatch";
import { Button } from "../Button";
import { ListErrorState } from "../ListErrorState";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";
import { EntityLink } from "../shared/EntityLink";

type Props = {
  driverId: string;
  operatingCompanyId: string;
};

const COLUMNS: Array<ParityColumn<DispatchAssignmentHistoryRow>> = [
  {
    key: "load_number",
    label: "Load #",
    sortable: true,
    render: (row) => (
      <EntityLink
        kind="load"
        id={row.load_id}
        label={row.load_number ?? row.load_id}
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
      <EntityLink
        kind="driver"
        id={row.previous_driver_id}
        label={row.previous_driver_name ?? undefined}
        data-testid={`driver-load-history-prev-driver-${row.id}`}
      />
    ),
  },
  {
    key: "new_driver_name",
    label: "New Driver",
    sortable: true,
    render: (row) => (
      <EntityLink
        kind="driver"
        id={row.new_driver_id}
        label={row.new_driver_name ?? undefined}
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

export function LoadHistoryTab({ driverId, operatingCompanyId }: Props) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

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

  const rows = historyQ.data?.rows ?? [];

  return (
    <div className="space-y-3" data-testid="driver-load-history-tab">
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
          columns={COLUMNS}
          rows={rows}
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
                  className="mt-1 block rounded-sm border border-gray-300 px-2 py-1 text-sm"
                  value={fromDate}
                  onChange={(next) => setFromDate(next)}
                  data-testid="driver-load-history-filter-from"
                />
              </label>
              <label className="text-xs text-gray-600">
                To
                <DatePicker
                  className="mt-1 block rounded-sm border border-gray-300 px-2 py-1 text-sm"
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
    </div>
  );
}
