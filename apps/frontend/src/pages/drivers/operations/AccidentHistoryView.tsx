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
        { key: "description", label: "Description" },
        { key: "at_fault", label: "At Fault" },
        { key: "preventable", label: "Preventable" },
        { key: "unit_id", label: "Unit", entityKind: "unit" },
        { key: "load_id", label: "Load", entityKind: "load" },
      ]}
    />
  );
}
