import { AuditReportPage } from "./AuditReportPage";
import { AUDIT_REPORT_ENDPOINTS } from "../../../api/auditReports";

export function AuditPeriodCloseHistoryPage() {
  return (
    <AuditReportPage
      title="Period Close History"
      subtitle="Closed and reopened accounting periods"
      endpoint={AUDIT_REPORT_ENDPOINTS.periodCloseHistory}
    />
  );
}
