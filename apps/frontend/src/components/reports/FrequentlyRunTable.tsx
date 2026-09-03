import type { FrequentlyRunReport } from "../../api/reports";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";

type Props = {
  rows: FrequentlyRunReport[];
  onRun: (row: FrequentlyRunReport) => void;
};

function ReportNameCell({
  row,
  onRun,
}: {
  row: FrequentlyRunReport;
  onRun: (row: FrequentlyRunReport) => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={() => onRun(row)}
        className="text-left font-semibold text-slate-800 hover:text-[#1f2a44] hover:underline"
      >
        {row.name}
      </button>
      {row.status === "stub" ? (
        <span className="ml-2 rounded-sm border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs font-semibold text-slate-700">
          {row.id === "ar-aging" ? "P5" : "P4"}
        </span>
      ) : null}
    </>
  );
}

export function FrequentlyRunTable({ rows, onRun }: Props) {
  const columns: Array<ParityColumn<FrequentlyRunReport>> = [
    {
      key: "name",
      label: "Report",
      sortable: true,
      render: (row) => <ReportNameCell row={row} onRun={onRun} />,
    },
    {
      key: "filters",
      label: "Filters",
      sortable: true,
      cellClass: "text-slate-600",
      render: (row) => row.filters,
    },
    {
      key: "runs",
      label: "Runs",
      sortable: true,
      cellClass: "font-semibold text-slate-800 tabular-nums",
      render: (row) => row.runs,
    },
  ];

  return (
    <section className="rounded-sm border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <h3 className="text-sm font-semibold text-slate-900">Frequently run</h3>
        {/* Removed dead "View all" href="#" link — this table already lives on the reports
            landing; there is no separate all-reports destination (QA-sweep). */}
      </div>
      <div className="p-2">
        <ParityTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          storageKey="reports-frequently-run"
          emptyText="No frequently run reports yet."
          tableTestId="reports-frequently-run-table"
          rowTestId={(row) => `reports-frequently-run-row-${row.id}`}
          initialPageSize={25}
        />
      </div>
    </section>
  );
}
