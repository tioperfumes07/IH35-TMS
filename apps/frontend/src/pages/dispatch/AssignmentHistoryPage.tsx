import { useQuery } from "@tanstack/react-query";
import { DatePicker } from "../../components/forms/DatePicker";
import { useState } from "react";
import { Link } from "react-router-dom";
import { listDispatchAssignmentHistory } from "../../api/dispatch";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/layout/PageHeader";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
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
  type AssignmentHistoryRow = (typeof rows)[number];

  // Migrated to the shared QBO-parity grid — columns, order, and the load deep-link are preserved
  // verbatim (§7 additive-only).
  const columns: Array<ParityColumn<AssignmentHistoryRow>> = [
    { key: "assigned_at", label: "Assigned at", sortable: true, render: (row) => new Date(row.assigned_at).toLocaleString() },
    {
      key: "load_number",
      label: "Load",
      sortable: true,
      render: (row) =>
        row.load_id ? (
          <Link to={`/dispatch?load_id=${encodeURIComponent(row.load_id)}`} className="text-slate-700 hover:underline">
            {row.load_number ?? row.load_id}
          </Link>
        ) : (
          row.load_number ?? "—"
        ),
    },
    { key: "assignment_method", label: "Method", sortable: true },
    { key: "previous_driver_name", label: "Previous driver", render: (row) => row.previous_driver_name ?? "—" },
    { key: "new_driver_name", label: "New driver", render: (row) => row.new_driver_name ?? "—" },
    { key: "reason_code", label: "Reason", render: (row) => row.reason_code ?? row.notes ?? "—" },
  ];

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
            className="rounded border border-gray-300 h-9 px-2 text-[13px]"
            placeholder="Filter by driver UUID"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">From</label>
          <DatePicker value={from} onChange={(next) => setFrom(next)} className="rounded border px-2 text-sm py-2" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">To</label>
          <DatePicker value={to} onChange={(next) => setTo(next)} className="rounded border px-2 text-sm py-2" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">Reason contains</label>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="rounded border border-gray-300 h-9 px-2 text-[13px]"
          />
        </div>
      </section>

      <ParityTable<AssignmentHistoryRow>
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={historyQ.isLoading}
        emptyText="No assignment history for current filters."
        storageKey="dispatch-assignment-history"
        exportFilename="assignment-history"
      />

      <div className="flex justify-end">
        <Button size="sm" variant="secondary" onClick={() => historyQ.refetch()}>
          Refresh
        </Button>
      </div>
    </div>
  );
}
