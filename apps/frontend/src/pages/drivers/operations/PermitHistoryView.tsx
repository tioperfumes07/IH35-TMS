import { OperationsHistoryTable } from "../../../components/drivers/OperationsHistoryTable";

type Props = { driverId: string; operatingCompanyId: string };

export function PermitHistoryView({ driverId, operatingCompanyId }: Props) {
  return (
    <OperationsHistoryTable
      driverId={driverId}
      operatingCompanyId={operatingCompanyId}
      subView="permit-history"
      title="Permit History"
      description="CDL, medical and state permits with expiry dates."
      columns={[
        { key: "permit_type", label: "Type" },
        { key: "issuing_state", label: "State" },
        { key: "permit_number", label: "Number" },
        { key: "expiration_date", label: "Expires" },
      ]}
    />
  );
}
