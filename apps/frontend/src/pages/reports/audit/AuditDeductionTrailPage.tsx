import { AuditReportPage } from "./AuditReportPage";
import { AUDIT_REPORT_ENDPOINTS } from "../../../api/auditReports";

export function AuditDeductionTrailPage() {
  return (
    <AuditReportPage
      title="Deduction Trail"
      subtitle="Banking driver-tags → settlement application — fines, accidents, chargebacks"
      endpoint={AUDIT_REPORT_ENDPOINTS.deductionTrail}
      showDriverFilter
    />
  );
}
