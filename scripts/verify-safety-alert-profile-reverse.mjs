#!/usr/bin/env node
/** @matrix-built {"modules":["safety"],"cols":["reverse_link"],"leafRe":"^safety\\.(drawer|parity)\\.(company_violation_detail|integrity_alert_detail|anomaly_detail)$","task":"VERTICAL-REVERSE-LINK-SAFETY-ALERTS"} */
import fs from "node:fs";
const read = (path) => fs.readFileSync(path, "utf8");
const files = {
  companyRoutes: read("apps/backend/src/safety/company-violations.routes.ts"),
  integrityRoutes: read("apps/backend/src/safety/integrity-alerts.routes.ts"),
  anomalyRoutes: read("apps/backend/src/integrity/anomaly-status.routes.ts"),
  section: read("apps/frontend/src/components/safety/SafetyAlertsReverseSection.tsx"),
  entityLink: read("apps/frontend/src/components/shared/EntityLink.tsx"),
  companyPage: read("apps/frontend/src/pages/safety/CompanyViolationsPage.tsx"),
  integrityPage: read("apps/frontend/src/pages/safety/IntegrityAlertsPage.tsx"),
  anomalyPage: read("apps/frontend/src/pages/safety/tabs/AnomaliesTab.tsx"),
  integrityReports: read("apps/frontend/src/pages/safety/tabs/IntegrityReportsTab.tsx"),
  companyDrawer: read("apps/frontend/src/pages/safety/components/CompanyViolationDetailDrawer.tsx"),
  profiles: [
    "apps/frontend/src/pages/drivers/DriverProfilePage.tsx",
    "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
    "apps/frontend/src/pages/VendorDetail.tsx",
    "apps/frontend/src/pages/CustomerDetail.tsx",
    "apps/frontend/src/pages/accounting/InvoiceDetailPage.tsx",
  ].map(read).join("\n"),
};
function failures(s = files) { return [
  ["company violation driver/unit reverse filters", s.companyRoutes.includes("companyViolationListQuerySchema.safeParse") && s.companyRoutes.includes("d.driver_id = $2::uuid") && s.companyRoutes.includes("u.unit_id = $3::uuid")],
  ["integrity alert subject FK filters", s.integrityRoutes.includes('for (const column of ["subject_driver_id", "subject_unit_id", "subject_vendor_id"]') && s.integrityRoutes.includes("filters.push(`${column} = $${values.length}::uuid`)")],
  ["anomaly subject id filter", s.anomalyRoutes.includes("subject_id: z.string().uuid().optional()") && s.anomalyRoutes.includes("subject_id = $${values.length}::uuid")],
  ["all applicable profile consumers", ["driver", "unit", "vendor", "customer", "invoice"].every((kind) => s.profiles.includes(`subjectKind=\"${kind}\"`))],
  ["exact three record targets", s.section.includes('kind="company_violation"') && s.section.includes('kind="integrity_alert"') && s.section.includes('kind="integrity_anomaly"') && s.entityLink.includes('case "company_violation":') && s.entityLink.includes("/safety/external-fines?record_type=company-violation&violation_id=") && s.entityLink.includes("/safety/integrity-alerts?alert_id=") && s.entityLink.includes("/safety/integrity-reports?anomaly_id=")],
  ["target drawers honor ids", s.companyPage.includes('searchParams.get("violation_id")') && s.integrityPage.includes('searchParams.get("alert_id")') && s.anomalyPage.includes('searchParams.get("anomaly_id")') && s.integrityReports.includes('searchParams.get("anomaly_id")')],
  ["company violation unit forward links", s.companyDrawer.includes("violation.related_unit_ids") && s.companyDrawer.includes('kind="unit" id={unitId}')],
  ["company violation human label projections", (s.companyRoutes.match(/AS related_driver_labels/g) ?? []).length === 2 && (s.companyRoutes.match(/AS related_unit_labels/g) ?? []).length === 2],
  ["company violation driver label tenant joins", (s.companyRoutes.match(/md\.operating_company_id = cv\.operating_company_id/g) ?? []).length === 2],
  ["company violation unit label owner/lease joins", (s.companyRoutes.match(/COALESCE\(mu\.currently_leased_to_company_id, mu\.owner_company_id\) = cv\.operating_company_id/g) ?? []).length === 2],
  ["company violation drawer consumes labels", s.companyDrawer.includes("entityLabel(driverLabels[driverId], driverId, \"Driver\")") && s.companyDrawer.includes("entityLabel(unitLabels[unitId], unitId, \"Unit\")")],
].filter(([, ok]) => !ok).map(([name]) => name); }
if (process.argv.includes("--selftest")) {
  const checks = [
    failures({...files, companyRoutes: files.companyRoutes.replace("d.driver_id = $2::uuid", "TRUE")}).includes("company violation driver/unit reverse filters"),
    failures({...files, integrityRoutes: files.integrityRoutes.replace('"subject_driver_id", "subject_unit_id", "subject_vendor_id"', '"subject_type"')}).includes("integrity alert subject FK filters"),
    failures({...files, anomalyRoutes: files.anomalyRoutes.replace("subject_id = $${values.length}::uuid", "TRUE")}).includes("anomaly subject id filter"),
    failures({...files, profiles: files.profiles.replace('subjectKind="invoice"', 'subjectKind="record"')}).includes("all applicable profile consumers"),
    failures({...files, section: files.section.replace('kind="integrity_alert"', 'kind="unit"')}).includes("exact three record targets"),
    failures({...files, companyPage: files.companyPage.replace('searchParams.get("violation_id")', 'null')}).includes("target drawers honor ids"),
    failures({...files, companyDrawer: files.companyDrawer.replace('kind="unit" id={unitId}', 'kind="driver" id={unitId}')}).includes("company violation unit forward links"),
    failures({...files, companyRoutes: files.companyRoutes.replace("AS related_driver_labels", "AS unresolved_driver_labels")}).includes("company violation human label projections"),
    failures({...files, companyRoutes: files.companyRoutes.replace("md.operating_company_id = cv.operating_company_id", "TRUE")}).includes("company violation driver label tenant joins"),
    failures({...files, companyRoutes: files.companyRoutes.replace("COALESCE(mu.currently_leased_to_company_id, mu.owner_company_id) = cv.operating_company_id", "TRUE")}).includes("company violation unit label owner/lease joins"),
    failures({...files, companyDrawer: files.companyDrawer.replace("driverLabels[driverId]", "undefined")}).includes("company violation drawer consumes labels"),
  ];
  if (checks.some((ok) => !ok)) { console.error(`verify-safety-alert-profile-reverse selftest FAIL — mutations ${checks.map((ok,i)=>ok?null:i+1).filter(Boolean).join(", ")} stayed green`); process.exit(1); }
  console.log("verify-safety-alert-profile-reverse selftest PASS — 11/11 API/profile/label/target mutations red"); process.exit(0);
}
const missing = failures(); if (missing.length) { console.error(`verify-safety-alert-profile-reverse FAIL — ${missing.join(", ")}`); process.exit(1); }
console.log("verify-safety-alert-profile-reverse PASS — five subject profiles resolve exact safety drawers");
