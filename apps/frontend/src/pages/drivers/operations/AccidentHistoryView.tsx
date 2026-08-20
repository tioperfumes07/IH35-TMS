import { OperationsHistoryTable } from "../../../components/drivers/OperationsHistoryTable";

type Props = { driverId: string; operatingCompanyId: string };

export function AccidentHistoryView({ driverId, operatingCompanyId }: Props) {
  return (
    <OperationsHistoryTable
      driverId={driverId}
      operatingCompanyId={operatingCompanyId}
      subView="accident-history"
      title="Accident History"
      description="Accident reports cross-linked to safety incidents."
      columns={[
        { key: "occurred_at", label: "Occurred" },
        { key: "description", label: "Description", entityKind: "accident", idKey: "uuid" },
        { key: "at_fault", label: "At Fault" },
        { key: "preventable", label: "Preventable" },
        { key: "unit_number", label: "Unit", entityKind: "unit", idKey: "unit_id" },
        { key: "load_number", label: "Load", entityKind: "load", idKey: "load_id" },
        { key: "vendor_name", label: "Vendor", entityKind: "vendor", idKey: "vendor_id" },
      ]}
    />
  );
}
