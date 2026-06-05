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

export function RecoursePipelineTable({ rows, fmtCurrency, fmtDate }: Props) {
  const { pushToast } = useToast();

  return (
    <BulkSelectableTable
      entityType="factoring-recourse"
      rows={rows}
      getRowId={(row) => row.factoring_advance_id}
      bulkActions={[
        { id: "export", label: "Export Selected", onClick: () => pushToast("Export recourse pipeline queued.", "success") },
        { id: "extend", label: "Extend Recourse", onClick: () => pushToast("Extend recourse — bulk endpoint pending.", "success") },
      ]}
    >
      {(ctx) => (
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
      )}
    </BulkSelectableTable>
  );
}
