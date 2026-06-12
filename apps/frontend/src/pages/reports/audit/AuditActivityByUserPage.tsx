import { AuditReportPage } from "./AuditReportPage";
import { AUDIT_REPORT_ENDPOINTS } from "../../../api/auditReports";

export function AuditActivityByUserPage() {
  return (
    <AuditReportPage
      title="Activity by User"
      subtitle="Who did what — filterable by date range"
      endpoint={AUDIT_REPORT_ENDPOINTS.activityByUser}
    />
  );
}
