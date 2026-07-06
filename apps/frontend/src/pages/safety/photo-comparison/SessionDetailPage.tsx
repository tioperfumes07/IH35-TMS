import { useParams } from "react-router-dom";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { SessionDetail } from "./SessionDetail";

export function SessionDetailPage() {
  const { sessionUuid } = useParams<{ sessionUuid: string }>();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  if (!sessionUuid) {
    return <div className="p-4 text-sm text-red-600">Session UUID required.</div>;
  }

  return <SessionDetail sessionUuid={sessionUuid} operatingCompanyId={companyId} />;
}
