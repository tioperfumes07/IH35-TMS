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
        // LAW OF THE LAND §9 (2026-07-22): rows are driver_finance.driver_advances — drill straight
        // into the Cash Advances detail drawer (row.uuid is that advance's own id, see
        // debt-history.service.ts's `id::text AS uuid`).
        { key: "advance_type", label: "Type", entityKind: "cash_advance", idKey: "uuid" },
        { key: "principal_amount", label: "Principal" },
        { key: "balance_remaining", label: "Balance" },
        { key: "status", label: "Status" },
        { key: "created_at", label: "Created" },
      ]}
    />
  );
}
