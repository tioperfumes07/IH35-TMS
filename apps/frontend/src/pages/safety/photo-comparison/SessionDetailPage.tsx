import { useParams } from "react-router-dom";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { SessionDetail } from "./SessionDetail";
import { PageHeader } from "../../../components/layout/PageHeader";

export function SessionDetailPage() {
  const { sessionUuid } = useParams<{ sessionUuid: string }>();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  if (!sessionUuid) {
    return <div className="p-4 text-sm text-red-600">Session UUID required.</div>;
  }

  return (
    <div className="space-y-3 p-4">
      <PageHeader
        backHref="/safety"
        breadcrumb={["Safety", "Photo comparison"]}
        title="Photo comparison"
        subtitle={`Session ${sessionUuid}`}
      />
      <SessionDetail sessionUuid={sessionUuid} operatingCompanyId={companyId} />
    </div>
  );
}
