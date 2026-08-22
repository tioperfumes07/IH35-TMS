import { entityLabel } from "../../lib/entity-label";
import { useMemo } from "react";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLink } from "../../components/shared/EntityLink";
import { useToast } from "../../components/Toast";

export type RecoursePipelineRow = {
  factoring_advance_id: string;
  invoice_reference: string;
  customer_id: string | null;
  customer_name: string;
  advance_amount: number;
  reserve_amount: number;
  recourse_expiry_date: string | null;
  days_until_recourse_expiry: number | null;
};

type Props = {
  rows: RecoursePipelineRow[];
  fmtCurrency: (value: unknown) => string;
  fmtDate: (value: unknown) => string;
};

// Minimal RFC-4180 CSV cell escaping (mirrors the inline pattern in AccountRegisterPage/useListExport).
function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function downloadCsv(filename: string, header: string[], rows: string[][]) {
  const lines = [header, ...rows].map((cols) => cols.map(csvCell).join(","));
  const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function RecoursePipelineTable({ rows, fmtCurrency, fmtDate }: Props) {
  const { pushToast } = useToast();

  const exportSelected = (selected: RecoursePipelineRow[]) => {
    if (selected.length === 0) {
      pushToast("Select at least one row to export.", "info");
      return;
    }
    downloadCsv(
      `factoring-recourse-pipeline-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Invoice", "Customer", "Advance", "Reserve", "Recourse Expiry", "Days Left"],
      selected.map((row) => [
        row.invoice_reference,
        row.customer_name,
        fmtCurrency(row.advance_amount),
        fmtCurrency(row.reserve_amount),
        fmtDate(row.recourse_expiry_date),
        String(Number(row.days_until_recourse_expiry ?? 0)),
      ])
    );
    pushToast(`Exported ${selected.length} recourse row(s).`, "success");
  };

  const columns: Array<ParityColumn<RecoursePipelineRow>> = useMemo(
    () => [
      {
        key: "invoice_reference",
        label: "Invoice",
        sortable: true,
        cellClass: "font-medium text-gray-900",
        render: (row) => {
          const invoice = typeof row.invoice_reference === "string" ? row.invoice_reference.trim() : "";
          return (
            <EntityLink
              kind="factoring_advance"
              id={row.factoring_advance_id}
              label={invoice !== "" ? invoice : "No invoice #"}
            />
          );
        }
      },
      {
        key: "customer_name",
        label: "Customer",
        sortable: true,
        render: (row) =>
          row.customer_id ? (
            <EntityLink
              kind="customer"
              id={row.customer_id}
              label={entityLabel(row.customer_name, row.customer_id, "Customer")}
            />
          ) : (
            entityLabel(row.customer_name, null, "Customer")
          ),
      },
      {
        key: "advance_amount",
        label: "Advance",
        sortable: true,
        render: (row) => fmtCurrency(row.advance_amount),
      },
      {
        key: "reserve_amount",
        label: "Reserve",
        sortable: true,
        render: (row) => fmtCurrency(row.reserve_amount),
      },
      {
        key: "recourse_expiry_date",
        label: "Recourse Expiry",
        sortable: true,
        render: (row) => fmtDate(row.recourse_expiry_date),
      },
      {
        key: "days_until_recourse_expiry",
        label: "Days Left",
        sortable: true,
        render: (row) => Number(row.days_until_recourse_expiry ?? 0),
        sortValue: (row) => Number(row.days_until_recourse_expiry ?? 0),
      },
    ],
    [fmtCurrency, fmtDate],
  );

  return (
    <ParityTable<RecoursePipelineRow>
      columns={columns}
      rows={rows}
      rowKey={(row) => row.factoring_advance_id}
      emptyText="No recourse pipeline rows available in this environment."
      storageKey="factoring-recourse-pipeline"
      tableTestId="factoring-recourse-pipeline-table"
      selectable
      maxSelectable={200}
      onSelectionCapExceeded={() =>
        pushToast("You can select up to 200 items at a time. Clear some selections and try again.", "error")
      }
      batchActions={(selected) => (
        <>
          <button
            type="button"
            className="rounded-sm border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
            onClick={() => exportSelected(selected)}
          >
            Export Selected
          </button>
          <button
            type="button"
            disabled
            className="rounded-sm border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
            onClick={() => pushToast("Bulk recourse extension is not available yet.", "info")}
          >
            Extend Recourse
          </button>
        </>
      )}
    />
  );
}
