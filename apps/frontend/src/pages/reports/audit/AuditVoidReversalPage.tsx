import { AuditReportPage } from "./AuditReportPage";
import { AUDIT_REPORT_ENDPOINTS } from "../../../api/auditReports";

export function AuditVoidReversalPage() {
  return (
    <AuditReportPage
      title="Void & Reversal Report"
      subtitle="Every voided or reversed financial record — who, when, why"
      endpoint={AUDIT_REPORT_ENDPOINTS.voidReversal}
    />
  );
}
