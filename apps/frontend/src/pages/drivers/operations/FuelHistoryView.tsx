import { OperationsHistoryTable } from "../../../components/drivers/OperationsHistoryTable";

type Props = { driverId: string; operatingCompanyId: string };

export function FuelHistoryView({ driverId, operatingCompanyId }: Props) {
  return (
    <OperationsHistoryTable
      driverId={driverId}
      operatingCompanyId={operatingCompanyId}
      subView="fuel-history"
      title="Fuel History"
      description="Per-driver fuel transactions."
      columns={[
        { key: "transaction_date", label: "Date" },
        { key: "merchant", label: "Merchant" },
        { key: "gallons", label: "Gallons" },
        { key: "total_amount", label: "Total" },
      ]}
    />
  );
}
