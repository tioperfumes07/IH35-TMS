import { AuditReportPage } from "./AuditReportPage";
import { AUDIT_REPORT_ENDPOINTS } from "../../../api/auditReports";

export function AuditActivityByModulePage() {
  return (
    <AuditReportPage
      title="Activity by Module"
      subtitle="Dispatch / Maintenance / Accounting / Banking — filterable by module and date"
      endpoint={AUDIT_REPORT_ENDPOINTS.activityByModule}
      showModuleFilter
    />
  );
}
