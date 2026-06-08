import { OperationsHistoryTable } from "../../../components/drivers/OperationsHistoryTable";

type Props = { driverId: string; operatingCompanyId: string };

export function SafetyEventsView({ driverId, operatingCompanyId }: Props) {
  return (
    <OperationsHistoryTable
      driverId={driverId}
      operatingCompanyId={operatingCompanyId}
      subView="safety-events"
      title="Safety Events"
      description="DVIR, harsh-brake and speeding events from Samsara telematics."
      columns={[
        { key: "occurred_at", label: "Occurred" },
        { key: "event_type", label: "Type" },
        { key: "severity", label: "Severity" },
        { key: "source", label: "Source" },
      ]}
    />
  );
}
