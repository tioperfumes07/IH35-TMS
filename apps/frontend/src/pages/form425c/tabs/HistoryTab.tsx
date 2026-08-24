import { useMemo, useState } from "react";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { CollapsedListFilters, useStagedListFilters } from "../../../components/table";
import type { HistoryReportRow } from "../types";

type Props = {
  reports: HistoryReportRow[];
  loading: boolean;
  onOpen: (id: string) => void;
  onAmend: (id: string) => void;
  onPrint: (id: string) => void;
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** Calendar month of reporting_month (YYYY-MM-DD / timestamptz). Never local Date — UTC midnight shifts August → July in US. */
function periodLabel(value: string) {
  const ymd = String(value).slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return value;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return value;
  return `${MONTH_NAMES[month - 1]} ${match[1]}`;
}

const STATUS_OPTIONS: Array<HistoryReportRow["status"] | ""> = ["", "draft", "ready_to_file", "filed", "amended"];

export function HistoryTab({ reports, loading, onOpen, onAmend, onPrint }: Props) {
  const [statusFilter, setStatusFilter] = useState<HistoryReportRow["status"] | "">("");
  const staged = useStagedListFilters({
    applied: { statusFilter },
    empty: { statusFilter: "" as HistoryReportRow["status"] | "" },
    onApply: (next) => setStatusFilter(next.statusFilter),
  });

  const filtered = useMemo(() => {
    if (!statusFilter) return reports;
    // Amend POST always inserts status='draft' + amended_from_uuid. Status "amended"
    // is never written — filtering === "amended" was a silent empty list.
    if (statusFilter === "amended") {
      return reports.filter((r) => Boolean(r.amended_from_uuid) || r.status === "amended");
    }
    return reports.filter((r) => r.status === statusFilter);
  }, [reports, statusFilter]);

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
            <button type="button" className="mr-2 rounded-sm border px-2 py-1 text-xs" onClick={() => onPrint(r.id)}>
              Print
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
    [onAmend, onOpen, onPrint],
  );

  return (
    <div className="space-y-3 p-4">
      <div className="rounded-sm border bg-white">
        <div className="border-b bg-slate-800 px-3 py-2 text-sm font-semibold text-white">Filing History</div>
        <ParityTable
          rows={filtered}
          columns={columns}
          rowKey={(r) => r.id}
          loading={loading}
          storageKey="form425c-history"
          emptyText="No reports found."
          filterBar={
            <CollapsedListFilters
              activeFilterCount={statusFilter ? 1 : 0}
              onApply={staged.apply}
              onReset={staged.reset}
              onCancel={staged.cancel}
              applyDisabled={!staged.dirty}
              testIdPrefix="form425c-history"
              dataAttributes={{ "data-form425c-history-filter-toolbar": "collapsed" }}
            >
              <label className="text-sm text-gray-700">
                Status{" "}
                <select
                  className="ml-1 rounded-sm border px-2 py-1"
                  value={staged.draft.statusFilter}
                  onChange={(e) =>
                    staged.setDraft({ statusFilter: e.target.value as HistoryReportRow["status"] | "" })
                  }
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s || "all"} value={s}>
                      {s || "All"}
                    </option>
                  ))}
                </select>
              </label>
            </CollapsedListFilters>
          }
        />
      </div>
    </div>
  );
}
