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
        { key: "severity", label: "Severity" },
        { key: "description", label: "Description" },
        { key: "incident_id", label: "Incident" },
      ]}
    />
  );
}
