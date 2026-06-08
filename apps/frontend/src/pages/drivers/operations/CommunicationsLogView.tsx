import { OperationsHistoryTable } from "../../../components/drivers/OperationsHistoryTable";

type Props = { driverId: string; operatingCompanyId: string };

export function CommunicationsLogView({ driverId, operatingCompanyId }: Props) {
  return (
    <OperationsHistoryTable
      driverId={driverId}
      operatingCompanyId={operatingCompanyId}
      subView="communications-log"
      title="Communications Log"
      description="Driver communications from the comm center."
      columns={[
        { key: "created_at", label: "Date" },
        { key: "direction", label: "Direction" },
        { key: "channel", label: "Channel" },
        { key: "body", label: "Message" },
      ]}
    />
  );
}
