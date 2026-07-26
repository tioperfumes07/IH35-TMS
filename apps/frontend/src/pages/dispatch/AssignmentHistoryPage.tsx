import { useQuery } from "@tanstack/react-query";
import { DatePicker } from "../../components/forms/DatePicker";
import { useState } from "react";
import { Link } from "react-router-dom";
import { listDispatchAssignmentHistory } from "../../api/dispatch";
import { Button } from "../../components/Button";
import { ListErrorState } from "../../components/ListErrorState";
import { PageHeader } from "../../components/layout/PageHeader";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLink } from "../../components/shared/EntityLink";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { EntityPicker } from "../../components/parity/EntityPicker";

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
    return <div className="rounded-sm border bg-white p-4 text-sm text-slate-600">Select an operating company.</div>;
  }

  const rows = historyQ.data?.rows ?? [];
  type AssignmentHistoryRow = (typeof rows)[number];

  // Migrated to the shared QBO-parity grid — columns/order preserved; id cells use EntityLink
  // (Law of the Land reverse drill-through) instead of plain text / ad-hoc Link.
  const columns: Array<ParityColumn<AssignmentHistoryRow>> = [
    { key: "assigned_at", label: "Assigned at", sortable: true, render: (row) => new Date(row.assigned_at).toLocaleString() },
    {
      key: "load_number",
      label: "Load",
      sortable: true,
      render: (row) => (
        <EntityLink kind="load" id={row.load_id} label={row.load_number ?? row.load_id} />
      ),
    },
    { key: "assignment_method", label: "Method", sortable: true },
    {
      key: "previous_driver_name",
      label: "Previous driver",
      render: (row) => (
        <EntityLink kind="driver" id={row.previous_driver_id} label={row.previous_driver_name ?? undefined} />
      ),
    },
    {
      key: "new_driver_name",
      label: "New driver",
      render: (row) => (
        <EntityLink kind="driver" id={row.new_driver_id} label={row.new_driver_name ?? undefined} />
      ),
    },
    { key: "reason_code", label: "Reason", render: (row) => row.reason_code ?? row.notes ?? "—" },
  ];

  return (
    <div data-testid="dispatch-assignment-history-page" className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title="Assignment History"
        subtitle="Load driver and unit reassignment audit trail"
        actions={
          <Link to="/dispatch" className="rounded-sm border px-3 py-1.5 text-sm">
            Dispatch Home
          </Link>
        }
      />

      <section className="grid gap-3 rounded-sm border bg-white p-4 md:grid-cols-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">Driver</label>
          {/* C1 PICKER LAW: was a raw-UUID box. allowCreate={false} — a FILTER narrows rows that
              already exist; offering to create a driver from a filter is nonsense, and no reference
              product (QBO, NetSuite, McLeod, Alvys) does it. */}
          <EntityPicker
            kind="driver"
            operatingCompanyId={companyId}
            value={driverId || null}
            onChange={(next) => setDriverId(next ?? "")}
            allowCreate={false}
            placeholder="All drivers"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">From</label>
          <DatePicker value={from} onChange={(next) => setFrom(next)} className="rounded-sm border px-2 text-sm py-2" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">To</label>
          <DatePicker value={to} onChange={(next) => setTo(next)} className="rounded-sm border px-2 text-sm py-2" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-600">Reason contains</label>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="rounded-sm border border-gray-300 h-9 px-2 text-[13px]"
          />
        </div>
      </section>

      {historyQ.isError ? (
        <ListErrorState
          title="Couldn't load assignment history"
          status={0}
          message={(historyQ.error as Error)?.message}
          onRetry={() => void historyQ.refetch()}
        />
      ) : (
        <ParityTable<AssignmentHistoryRow>
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          loading={historyQ.isLoading}
          emptyText="No assignment history for current filters."
          storageKey="dispatch-assignment-history"
          exportFilename="assignment-history"
        />
      )}

      <div className="flex justify-end">
        <Button size="sm" variant="secondary" onClick={() => void historyQ.refetch()}>
          Refresh
        </Button>
      </div>
    </div>
  );
}
