import { OperationsHistoryTable } from "../../../components/drivers/OperationsHistoryTable";
import { EntityLink } from "../../../components/shared/EntityLink";

type Props = { driverId: string; operatingCompanyId: string };

export function SafetyEventsView({ driverId, operatingCompanyId }: Props) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-gray-600">
        Driver profile: <EntityLink kind="driver" id={driverId} label="Open driver" />
      </p>
      <OperationsHistoryTable
        driverId={driverId}
        operatingCompanyId={operatingCompanyId}
        subView="safety-events"
        title="Safety Events"
        description="DVIR, harsh-brake and speeding events from Samsara telematics."
        columns={[
          { key: "occurred_at", label: "Occurred" },
          { key: "event_type", label: "Type", enumLabel: true },
          { key: "severity", label: "Severity", enumLabel: true },
          { key: "unit_number", label: "Unit", entityKind: "unit", idKey: "unit_id" },
          { key: "source", label: "Source" },
        ]}
      />
    </div>
  );
}
