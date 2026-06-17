import { useQuery } from "@tanstack/react-query";
import { DatePicker } from "../../components/forms/DatePicker";
import { useState } from "react";
import { listDispatchAssignmentHistory } from "../../api/dispatch";
import { Button } from "../Button";

type Props = {
  driverId: string;
  operatingCompanyId: string;
};

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
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-gray-600">
          From
          <DatePicker
            className="mt-1 block rounded border border-gray-300 px-2 py-1 text-sm"
            value={fromDate}
            onChange={(next) => setFromDate(next)}
            data-testid="driver-load-history-filter-from"
          />
        </label>
        <label className="text-xs text-gray-600">
          To
          <DatePicker
            className="mt-1 block rounded border border-gray-300 px-2 py-1 text-sm"
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

      {historyQ.isLoading ? <p className="text-sm text-gray-500">Loading load history…</p> : null}
      {historyQ.isError ? (
        <p className="text-sm text-red-600" data-testid="driver-load-history-error">
          Unable to load assignment history.
        </p>
      ) : null}

      {!historyQ.isLoading && rows.length === 0 ? (
        <p className="text-sm text-gray-500" data-testid="driver-load-history-empty">
          No load assignment history for this driver.
        </p>
      ) : null}

      {rows.length > 0 ? (
        <div className="overflow-x-auto">
        <table className="min-w-full text-xs" data-testid="driver-load-history-table">
          <thead>
            <tr className="border-b text-left text-gray-600">
              <th className="py-2 pr-3">Load #</th>
              <th className="py-2 pr-3">Assigned At</th>
              <th className="py-2 pr-3">Method</th>
              <th className="py-2 pr-3">Previous Driver</th>
              <th className="py-2 pr-3">New Driver</th>
              <th className="py-2">Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b align-top" data-testid={`driver-load-history-row-${row.id}`}>
                <td className="py-2 pr-3 font-medium">{row.load_number ?? row.load_id}</td>
                <td className="py-2 pr-3 whitespace-nowrap">{new Date(row.assigned_at).toLocaleString()}</td>
                <td className="py-2 pr-3">{row.assignment_method}</td>
                <td className="py-2 pr-3">{row.previous_driver_name ?? "—"}</td>
                <td className="py-2 pr-3">{row.new_driver_name ?? "—"}</td>
                <td className="py-2">{row.reason_code ?? row.notes ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      ) : null}
    </div>
  );
}
