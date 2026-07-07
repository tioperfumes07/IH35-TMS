import { useMemo } from "react";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import type { HistoryReportRow } from "../types";

type Props = {
  reports: HistoryReportRow[];
  loading: boolean;
  onOpen: (id: string) => void;
  onAmend: (id: string) => void;
};

function periodLabel(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function HistoryTab({ reports, loading, onOpen, onAmend }: Props) {
  const columns = useMemo<ParityColumn<HistoryReportRow>[]>(
    () => [
      { key: "reporting_month", label: "Reporting Month", sortable: true, render: (r) => periodLabel(r.reporting_month) },
      { key: "status", label: "Status", sortable: true, render: (r) => r.status },
      { key: "filed_at", label: "Filed Date", sortable: true, render: (r) => (r.filed_at ? new Date(r.filed_at).toLocaleString() : "—") },
      { key: "amended_from_uuid", label: "Amended?", render: (r) => (r.amended_from_uuid ? "Yes" : "No") },
      {
        key: "actions",
        label: "Actions",
        alwaysVisible: true,
        className: "text-right",
        cellClass: "text-right",
        render: (r) => (
          <>
            <button type="button" className="mr-2 rounded-sm border px-2 py-1 text-xs" onClick={() => onOpen(r.id)}>
              Open
            </button>
            {r.status === "filed" ? (
              <button type="button" className="rounded-sm bg-slate-800 px-2 py-1 text-xs text-white" onClick={() => onAmend(r.id)}>
                Amend
              </button>
            ) : null}
          </>
        ),
      },
    ],
    [onAmend, onOpen],
  );

  return (
    <div className="space-y-3 p-4">
      <div className="rounded-sm border bg-white">
        <div className="border-b bg-slate-800 px-3 py-2 text-sm font-semibold text-white">Filing History</div>
        <ParityTable
          rows={reports}
          columns={columns}
          rowKey={(r) => r.id}
          loading={loading}
          storageKey="form425c-history"
          emptyText="No reports found."
        />
      </div>
    </div>
  );
}
