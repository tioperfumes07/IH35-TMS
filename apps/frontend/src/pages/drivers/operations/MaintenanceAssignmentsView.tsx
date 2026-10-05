import { OperationsHistoryTable } from "../../../components/drivers/OperationsHistoryTable";
import { EntityLink } from "../../../components/shared/EntityLink";

type Props = { driverId: string; operatingCompanyId: string };

export function MaintenanceAssignmentsView({ driverId, operatingCompanyId }: Props) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-gray-600">
        Driver profile: <EntityLink kind="driver" id={driverId} label="Open driver" />
      </p>
      <OperationsHistoryTable
        driverId={driverId}
        operatingCompanyId={operatingCompanyId}
        subView="maintenance-assignments"
        title="Maintenance Assignments"
        description="Which trucks this driver operated, over time."
        columns={[
          { key: "unit_number", label: "Unit", entityKind: "unit", idKey: "unit_id" },
          { key: "assigned_at", label: "Assigned" },
          { key: "unassigned_at", label: "Unassigned" },
        ]}
      />
    </div>
  );
}
