import { AuditReportPage } from "./AuditReportPage";
import { AUDIT_REPORT_ENDPOINTS } from "../../../api/auditReports";

export function AuditMaintenanceDecisionLogPage() {
  return (
    <AuditReportPage
      title="Maintenance Decision Log"
      subtitle="Driver-reported failures: accepted / deferred / approved / worked"
      endpoint={AUDIT_REPORT_ENDPOINTS.maintenanceDecisionLog}
    />
  );
}
