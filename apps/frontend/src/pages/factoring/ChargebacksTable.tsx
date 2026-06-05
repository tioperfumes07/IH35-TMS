import { BulkSelectableTable } from "../../components/shared/BulkSelectableTable";
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

export function ChargebacksTable({ rows, fmtCurrency, fmtDate }: Props) {
  const { pushToast } = useToast();

  return (
    <BulkSelectableTable
      entityType="factoring-chargebacks"
      rows={rows}
      getRowId={(row) => row.factoring_advance_id}
      bulkActions={[
        { id: "export", label: "Export Selected", onClick: () => pushToast("Export chargebacks queued.", "success") },
        { id: "dispute", label: "Dispute", onClick: () => pushToast("Dispute chargebacks — bulk endpoint pending.", "success") },
      ]}
    >
      {(ctx) => (
        <table className="min-w-full divide-y divide-gray-200 text-xs">
          <thead className="bg-gray-50 text-left uppercase tracking-wide text-gray-500">
            <tr>
              <th className="w-8 px-2 py-2">{ctx.renderHeaderCheckbox()}</th>
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
                <td className="px-2 py-2">{fmtDate(row.created_at)}</td>
                <td className="px-2 py-2">{row.statement_reference || "—"}</td>
                <td className="px-2 py-2">{fmtCurrency(row.chargeback_amount)}</td>
                <td className="px-2 py-2">{fmtCurrency(row.factor_fee_amount)}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-2 py-4 text-gray-500">
                  No chargeback/fee rows available.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      )}
    </BulkSelectableTable>
  );
}
