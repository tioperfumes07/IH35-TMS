import { OperationsHistoryTable } from "../../../components/drivers/OperationsHistoryTable";

type Props = { driverId: string; operatingCompanyId: string };

export function DocumentsVaultView({ driverId, operatingCompanyId }: Props) {
  return (
    <OperationsHistoryTable
      driverId={driverId}
      operatingCompanyId={operatingCompanyId}
      subView="documents-vault"
      title="Documents Vault"
      description="All documents uploaded for this driver."
      columns={[
        { key: "file_name", label: "File" },
        { key: "doc_type", label: "Type" },
        { key: "created_at", label: "Uploaded" },
      ]}
    />
  );
}
