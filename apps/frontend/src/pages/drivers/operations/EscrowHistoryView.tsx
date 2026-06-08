import { OperationsHistoryTable } from "../../../components/drivers/OperationsHistoryTable";

type Props = { driverId: string; operatingCompanyId: string };

export function EscrowHistoryView({ driverId, operatingCompanyId }: Props) {
  return (
    <OperationsHistoryTable
      driverId={driverId}
      operatingCompanyId={operatingCompanyId}
      subView="escrow-history"
      title="Escrow History"
      description="Escrow deposits, forfeitures and releases."
      columns={[
        { key: "entry_type", label: "Entry" },
        { key: "amount", label: "Amount" },
        { key: "running_balance", label: "Balance" },
        { key: "created_at", label: "Date" },
      ]}
    />
  );
}
