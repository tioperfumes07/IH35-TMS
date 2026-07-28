import { OperationsHistoryTable } from "../../../components/drivers/OperationsHistoryTable";

type Props = { driverId: string; operatingCompanyId: string };

export function EscrowHistoryView({ driverId, operatingCompanyId }: Props) {
  return (
    <OperationsHistoryTable
      driverId={driverId}
      operatingCompanyId={operatingCompanyId}
      subView="escrow-history"
      title="Escrow History"
      description="Escrow deposits, deductions and releases."
      columns={[
        { key: "entry_type", label: "Entry" },
        { key: "amount", label: "Amount" },
        { key: "running_balance", label: "Balance" },
        { key: "created_at", label: "Date" },
        // SAF-B22 — the hop back to the settlement that produced the movement. The ids were always
        // on driver_finance.escrow_ledger and were simply never selected, so an escrow balance could
        // not be traced to its source. entityKind renders the drill-through; idKey lets the cell
        // link on settlement_id while the column itself is that id.
        { key: "settlement_id", label: "Settlement", entityKind: "settlement", idKey: "settlement_id" },
      ]}
    />
  );
}
