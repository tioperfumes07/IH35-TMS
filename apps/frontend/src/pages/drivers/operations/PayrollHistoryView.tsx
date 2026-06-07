import { OperationsHistoryTable } from "../../../components/drivers/OperationsHistoryTable";

type Props = { driverId: string; operatingCompanyId: string };

export function PayrollHistoryView({ driverId, operatingCompanyId }: Props) {
  return (
    <OperationsHistoryTable
      driverId={driverId}
      operatingCompanyId={operatingCompanyId}
      subView="payroll-history"
      title="Payroll History"
      description="Settlement runs that paid this driver."
      columns={[
        { key: "period_start", label: "Period Start" },
        { key: "period_end", label: "Period End" },
        { key: "gross_pay", label: "Gross" },
        { key: "net_pay", label: "Net" },
        { key: "status", label: "Status" },
      ]}
    />
  );
}
