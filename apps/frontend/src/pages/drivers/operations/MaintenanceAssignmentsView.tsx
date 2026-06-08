import { OperationsHistoryTable } from "../../../components/drivers/OperationsHistoryTable";

type Props = { driverId: string; operatingCompanyId: string };

export function MaintenanceAssignmentsView({ driverId, operatingCompanyId }: Props) {
  return (
    <OperationsHistoryTable
      driverId={driverId}
      operatingCompanyId={operatingCompanyId}
      subView="maintenance-assignments"
      title="Maintenance Assignments"
      description="Which trucks this driver operated, over time."
      columns={[
        { key: "unit_number", label: "Unit" },
        { key: "assigned_at", label: "Assigned" },
        { key: "unassigned_at", label: "Unassigned" },
      ]}
    />
  );
}
