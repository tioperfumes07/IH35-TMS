import { OperationsHistoryTable } from "../../../components/drivers/OperationsHistoryTable";
import { EntityLink } from "../../../components/shared/EntityLink";

type Props = { driverId: string; operatingCompanyId: string };

export function FuelHistoryView({ driverId, operatingCompanyId }: Props) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-gray-600">
        Driver profile: <EntityLink kind="driver" id={driverId} label="Open driver" />
      </p>
      <OperationsHistoryTable
        driverId={driverId}
        operatingCompanyId={operatingCompanyId}
        subView="fuel-history"
        title="Fuel History"
        description="Per-driver fuel transactions."
        columns={[
          { key: "transaction_date", label: "Date" },
          { key: "merchant", label: "Merchant", entityKind: "vendor", idKey: "vendor_id" },
          { key: "gallons", label: "Gallons" },
          { key: "total_amount", label: "Total" },
          { key: "unit_number", label: "Unit", entityKind: "unit", idKey: "unit_id" },
          { key: "load_number", label: "Load", entityKind: "load", idKey: "load_id" },
        ]}
      />
    </div>
  );
}
