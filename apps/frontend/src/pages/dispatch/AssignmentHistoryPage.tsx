import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { listDispatchAssignmentHistory } from "../../api/dispatch";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";

export function AssignmentHistoryPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [driverId, setDriverId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");

  const historyQ = useQuery({
    queryKey: ["dispatch", "assignment-history-global", companyId, driverId, from, to, reason],
    queryFn: () =>
      listDispatchAssignmentHistory(companyId, {
        driver_id: driverId.trim() || undefined,
        from: from || undefined,
        to: to || undefined,
        reason: reason.trim() || undefined,
      }),
    enabled: Boolean(companyId),
  });

  if (!companyId) {
    return <div className="rounded border bg-white p-4 text-sm text-slate-600">Select an operating company.</div>;
  }

  const rows = historyQ.data?.rows ?? [];

  return (
    <div data-testid="dispatch-assignment-history-page" className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title="Assignment History"
        subtitle="Load driver and unit reassignment audit trail"
        actions={
          <Link to="/dispatch" className="rounded border px-3 py-1.5 text-sm">
            Dispatch Home
          </Link>
        }
      />

      <section className="grid gap-3 rounded border bg-white p-4 md:grid-cols-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">Driver ID</label>
          <input
            value={driverId}
            onChange={(event) => setDriverId(event.target.value)}
            className="rounded border border-gray-300 px-2 py-2 text-sm"
            placeholder="Filter by driver UUID"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">From</label>
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="rounded border px-2 py-2 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">To</label>
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="rounded border px-2 py-2 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">Reason contains</label>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="rounded border border-gray-300 px-2 py-2 text-sm"
          />
        </div>
      </section>

      <section className="overflow-x-auto rounded border bg-white">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Assigned at</th>
              <th className="px-3 py-2">Load</th>
              <th className="px-3 py-2">Method</th>
              <th className="px-3 py-2">Previous driver</th>
              <th className="px-3 py-2">New driver</th>
              <th className="px-3 py-2">Reason</th>
            </tr>
          </thead>
          <tbody>
            {historyQ.isLoading ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                  Loading assignment history…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                  No assignment history for current filters.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b last:border-b-0">
                  <td className="px-3 py-2">{new Date(row.assigned_at).toLocaleString()}</td>
                  <td className="px-3 py-2">{row.load_number ?? row.load_id}</td>
                  <td className="px-3 py-2">{row.assignment_method}</td>
                  <td className="px-3 py-2">{row.previous_driver_name ?? "—"}</td>
                  <td className="px-3 py-2">{row.new_driver_name ?? "—"}</td>
                  <td className="px-3 py-2">{row.reason_code ?? row.notes ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <div className="flex justify-end">
        <Button size="sm" variant="secondary" onClick={() => historyQ.refetch()}>
          Refresh
        </Button>
      </div>
    </div>
  );
}
