import { OperationsHistoryTable } from "../../../components/drivers/OperationsHistoryTable";

type Props = { driverId: string; operatingCompanyId: string };

export function SettlementHistoryView({ driverId, operatingCompanyId }: Props) {
  return (
    <OperationsHistoryTable
      driverId={driverId}
      operatingCompanyId={operatingCompanyId}
      subView="settlement-history"
      title="Settlement History"
      description="Per-settlement summary for drill-down."
      columns={[
        { key: "settlement_number", label: "Settlement #", entityKind: "settlement", idKey: "uuid" },
        // COL-06: period_start is already on the row (settlement-history.service.ts already
        // selects it) -- just never rendered here, leaving Period Begin blank.
        { key: "period_start", label: "Period Begin" },
        { key: "period_end", label: "Period End" },
        { key: "total_amount", label: "Total" },
        { key: "status", label: "Status" },
      ]}
    />
  );
}
