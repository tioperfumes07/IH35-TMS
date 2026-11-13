import { useSearchParams, useLocation, useParams } from "react-router-dom";
import { resolveBackHref } from "../../../lib/returnContext";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { SessionDetail } from "./SessionDetail";
import { PageHeader } from "../../../components/layout/PageHeader";

export function SessionDetailPage() {
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  // ROUND 8.20 Safety — honor ?ret= from Safety Home (fallback /safety/home).
  const safetyBackHref = resolveBackHref({ searchParams, pathname, fallback: "/safety/home" });
  const { sessionUuid } = useParams<{ sessionUuid: string }>();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  if (!sessionUuid) {
    return <div className="p-4 text-xs text-red-600">Session UUID required.</div>;
  }

  return (
    <div className="space-y-3 p-4">
      <PageHeader
        backHref={safetyBackHref}
        breadcrumb={["Safety", "Photo comparison"]}
        title="Photo comparison"
        subtitle={`Session ${sessionUuid}`}
      />
      <SessionDetail sessionUuid={sessionUuid} operatingCompanyId={companyId} />
    </div>
  );
}
