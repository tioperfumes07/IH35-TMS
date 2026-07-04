import { useRef } from "react";
import { BulkSelectableTable } from "../../components/shared/BulkSelectableTable";
import { useToast } from "../../components/Toast";

export type RecoursePipelineRow = {
  factoring_advance_id: string;
  invoice_reference: string;
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
  // Ref tracks the currently-selected rows so the bulk "Export Selected" action (whose onClick is
  // declared outside the render-prop) can build the CSV from the real selection.
  const selectedRef = useRef<RecoursePipelineRow[]>([]);

  const exportSelected = () => {
    const selected = selectedRef.current;
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

  return (
    <BulkSelectableTable
      entityType="factoring-recourse"
      rows={rows}
      getRowId={(row) => row.factoring_advance_id}
      bulkActions={[
        { id: "export", label: "Export Selected", onClick: exportSelected },
        {
          id: "extend",
          label: "Extend Recourse (coming soon)",
          disabled: true,
          onClick: () => pushToast("Bulk recourse extension is not available yet.", "info"),
        },
      ]}
    >
      {(ctx) => {
        // Updated during render (ref, not state — no re-render) so exportSelected sees live selection.
        selectedRef.current = rows.filter((row) => ctx.isSelected(row.factoring_advance_id));
        return (
          <table className="min-w-full divide-y divide-gray-200 text-xs">
            <thead className="bg-gray-50 text-left uppercase tracking-wide text-gray-500">
              <tr>
                <th className="w-8 px-2 py-2">{ctx.renderHeaderCheckbox()}</th>
                <th className="px-2 py-2">Invoice</th>
                <th className="px-2 py-2">Customer</th>
                <th className="px-2 py-2">Advance</th>
                <th className="px-2 py-2">Reserve</th>
                <th className="px-2 py-2">Recourse Expiry</th>
                <th className="px-2 py-2">Days Left</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.factoring_advance_id}>
                  <td className="px-2 py-2">{ctx.renderRowCheckbox(row.factoring_advance_id)}</td>
                  <td className="px-2 py-2 font-medium text-gray-900">{row.invoice_reference}</td>
                  <td className="px-2 py-2">{row.customer_name}</td>
                  <td className="px-2 py-2">{fmtCurrency(row.advance_amount)}</td>
                  <td className="px-2 py-2">{fmtCurrency(row.reserve_amount)}</td>
                  <td className="px-2 py-2">{fmtDate(row.recourse_expiry_date)}</td>
                  <td className="px-2 py-2">{Number(row.days_until_recourse_expiry ?? 0)}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-2 py-4 text-gray-500">
                    No recourse pipeline rows available in this environment.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        );
      }}
    </BulkSelectableTable>
  );
}
