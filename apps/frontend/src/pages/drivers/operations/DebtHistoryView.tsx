import { OperationsHistoryTable } from "../../../components/drivers/OperationsHistoryTable";

type Props = { driverId: string; operatingCompanyId: string };

export function DebtHistoryView({ driverId, operatingCompanyId }: Props) {
  return (
    <OperationsHistoryTable
      driverId={driverId}
      operatingCompanyId={operatingCompanyId}
      subView="debt-history"
      title="Debt History"
      description="All driver advances and liabilities with remaining balances."
      columns={[
        { key: "advance_type", label: "Type" },
        { key: "principal_amount", label: "Principal" },
        { key: "balance_remaining", label: "Balance" },
        { key: "status", label: "Status" },
        { key: "created_at", label: "Created" },
      ]}
    />
  );
}
