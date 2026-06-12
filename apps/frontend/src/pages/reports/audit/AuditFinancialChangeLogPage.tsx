import { AuditReportPage } from "./AuditReportPage";
import { AUDIT_REPORT_ENDPOINTS } from "../../../api/auditReports";

export function AuditFinancialChangeLogPage() {
  return (
    <AuditReportPage
      title="Financial Change Log"
      subtitle="All invoice / bill / payment / journal create, edit, void, post events"
      endpoint={AUDIT_REPORT_ENDPOINTS.financialChangeLog}
    />
  );
}
