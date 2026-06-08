import { OperationsHistoryTable } from "../../../components/drivers/OperationsHistoryTable";

type Props = { driverId: string; operatingCompanyId: string };

export function PwaEngagementView({ driverId, operatingCompanyId }: Props) {
  return (
    <OperationsHistoryTable
      driverId={driverId}
      operatingCompanyId={operatingCompanyId}
      subView="pwa-engagement"
      title="PWA Engagement"
      description="Driver app responses and acceptance activity."
      columns={[
        { key: "responded_at", label: "Responded" },
        { key: "response", label: "Response" },
        { key: "accepted", label: "Accepted" },
      ]}
    />
  );
}
