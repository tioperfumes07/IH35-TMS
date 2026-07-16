import { useRef } from "react";
import { BulkSelectableTable } from "../../components/shared/BulkSelectableTable";
import { EntityLink } from "../../components/shared/EntityLink";
import { useToast } from "../../components/Toast";

export type ChargebackFeeRow = {
  factoring_advance_id: string;
  created_at: string | null;
  statement_reference: string | null;
  chargeback_amount: number;
  factor_fee_amount: number;
};

type Props = {
  rows: ChargebackFeeRow[];
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

export function ChargebacksTable({ rows, fmtCurrency, fmtDate }: Props) {
  const { pushToast } = useToast();
  // Ref tracks the currently-selected rows so the bulk "Export Selected" action (whose onClick is
  // declared outside the render-prop) can build the CSV from the real selection.
  const selectedRef = useRef<ChargebackFeeRow[]>([]);

  const exportSelected = () => {
    const selected = selectedRef.current;
    if (selected.length === 0) {
      pushToast("Select at least one row to export.", "info");
      return;
    }
    downloadCsv(
      `factoring-chargebacks-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Advance Id", "Date", "Statement Ref", "Chargeback", "Fee"],
      selected.map((row) => [
        row.factoring_advance_id,
        fmtDate(row.created_at),
        row.statement_reference || "",
        fmtCurrency(row.chargeback_amount),
        fmtCurrency(row.factor_fee_amount),
      ])
    );
    pushToast(`Exported ${selected.length} chargeback row(s).`, "success");
  };

  return (
    <BulkSelectableTable
      entityType="factoring-chargebacks"
      rows={rows}
      getRowId={(row) => row.factoring_advance_id}
      bulkActions={[
        { id: "export", label: "Export Selected", onClick: exportSelected },
        {
          id: "dispute",
          label: "Dispute (coming soon)",
          disabled: true,
          onClick: () => pushToast("Bulk dispute is not available yet.", "info"),
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
                <th className="px-2 py-2">Advance</th>
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">Statement Ref</th>
                <th className="px-2 py-2">Chargeback</th>
                <th className="px-2 py-2">Fee</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.factoring_advance_id}>
                  <td className="px-2 py-2">{ctx.renderRowCheckbox(row.factoring_advance_id)}</td>
                  <td className="px-2 py-2">
                    <EntityLink
                      kind="factoring_advance"
                      id={row.factoring_advance_id}
                      label={row.statement_reference || row.factoring_advance_id.slice(0, 8)}
                    />
                  </td>
                  <td className="px-2 py-2">{fmtDate(row.created_at)}</td>
                  <td className="px-2 py-2">{row.statement_reference || "—"}</td>
                  <td className="px-2 py-2">{fmtCurrency(row.chargeback_amount)}</td>
                  <td className="px-2 py-2">{fmtCurrency(row.factor_fee_amount)}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-2 py-4 text-gray-500">
                    No chargeback/fee rows available.
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
