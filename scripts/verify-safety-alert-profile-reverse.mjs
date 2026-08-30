#!/usr/bin/env node
/** @matrix-built {"modules":["safety"],"cols":["reverse_link"],"leafRe":"^safety\\.(drawer|parity)\\.(company_violation_detail|integrity_alert_detail|anomaly_detail)$","task":"VERTICAL-REVERSE-LINK-SAFETY-ALERTS"} */
import fs from "node:fs";
const read = (path) => fs.readFileSync(path, "utf8");
const files = {
  companyRoutes: read("apps/backend/src/safety/company-violations.routes.ts"),
  integrityRoutes: read("apps/backend/src/safety/integrity-alerts.routes.ts"),
  anomalyRoutes: read("apps/backend/src/integrity/anomaly-status.routes.ts"),
  section: read(
    "apps/frontend/src/components/safety/SafetyAlertsReverseSection.tsx",
  ),
  entityLink: read("apps/frontend/src/components/shared/EntityLink.tsx"),
  companyPage: read("apps/frontend/src/pages/safety/CompanyViolationsPage.tsx"),
  integrityPage: read("apps/frontend/src/pages/safety/IntegrityAlertsPage.tsx"),
  integrityDrawer: read(
    "apps/frontend/src/pages/safety/components/IntegrityAlertDetailDrawer.tsx",
  ),
  anomalyPage: read("apps/frontend/src/pages/safety/tabs/AnomaliesTab.tsx"),
  integrityReports: read(
    "apps/frontend/src/pages/safety/tabs/IntegrityReportsTab.tsx",
  ),
  companyDrawer: read(
    "apps/frontend/src/pages/safety/components/CompanyViolationDetailDrawer.tsx",
  ),
  canonicalDriverDetail: read("apps/frontend/src/pages/DriverDetail.tsx"),
  profiles: [
    "apps/frontend/src/pages/drivers/DriverProfilePage.tsx",
    "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
    "apps/frontend/src/pages/VendorDetail.tsx",
    "apps/frontend/src/pages/CustomerDetail.tsx",
    "apps/frontend/src/pages/accounting/InvoiceDetailPage.tsx",
  ]
    .map(read)
    .join("\n"),
};
function failures(s = files) {
  return [
    [
      "company violation driver/unit reverse filters",
      s.companyRoutes.includes("companyViolationListQuerySchema.safeParse") &&
        s.companyRoutes.includes("d.driver_id = $2::uuid") &&
        s.companyRoutes.includes("u.unit_id = $3::uuid"),
    ],
    [
      "integrity alert subject FK filters",
      s.integrityRoutes.includes(
        'for (const column of ["subject_driver_id", "subject_unit_id", "subject_vendor_id"]',
      ) &&
        s.integrityRoutes.includes(
          "filters.push(`ia.${column} = $${values.length}::uuid`)",
        ),
    ],
    [
      "integrity alert human label projections",
      (s.integrityRoutes.match(/AS subject_driver_name/g) ?? []).length === 2 &&
        (s.integrityRoutes.match(/AS subject_unit_number/g) ?? []).length ===
          2 &&
        (s.integrityRoutes.match(/AS subject_vendor_name/g) ?? []).length === 2,
    ],
    [
      "integrity alert driver/vendor tenant joins",
      (
        s.integrityRoutes.match(
          /d\.operating_company_id = ia\.operating_company_id/g,
        ) ?? []
      ).length === 2 &&
        (
          s.integrityRoutes.match(
            /v\.operating_company_id = ia\.operating_company_id/g,
          ) ?? []
        ).length === 2,
    ],
    [
      "integrity alert unit owner lease joins",
      (
        s.integrityRoutes.match(
          /u\.owner_company_id = ia\.operating_company_id/g,
        ) ?? []
      ).length === 2 &&
        (
          s.integrityRoutes.match(
            /u\.currently_leased_to_company_id = ia\.operating_company_id/g,
          ) ?? []
        ).length === 2,
    ],
    // LST-F5163H: list chrome reverse for integrity alerts (API filters alone are not reverse).
    [
      "integrity alerts list EntityPicker subject filters",
      s.integrityPage.includes('dataTestId="integrity-alerts-filter-driver"') &&
        s.integrityPage.includes('dataTestId="integrity-alerts-filter-unit"') &&
        s.integrityPage.includes(
          'dataTestId="integrity-alerts-filter-vendor"',
        ) &&
        s.integrityPage.includes("allowCreate={false}"),
    ],
    [
      "integrity alerts list Linked-to EntityLink column",
      s.integrityPage.includes('label: "Linked to"') &&
        s.integrityPage.includes('kind="driver"') &&
        s.integrityPage.includes('kind="unit"') &&
        s.integrityPage.includes('kind="vendor"'),
    ],
    [
      "integrity evaluator refreshes the canonical inbox",
      s.integrityPage.includes("evaluateIntegrityAlerts(input.companyId)") &&
        s.integrityPage.includes(
          'invalidateQueries({ queryKey: ["safety", "integrity-alerts", input.companyId]',
        ),
    ],
    [
      "integrity alert rows open the real selected-record drawer",
      s.integrityPage.includes("onClick={() => setSelected(row)}") &&
        s.integrityPage.includes("open={Boolean(selected)}") &&
        s.integrityPage.includes("alert={selected}"),
    ],
    [
      "integrity alert drawer renders the canonical record payload",
      s.integrityDrawer.includes("IntegrityAlertDetailDrawer") &&
        s.integrityDrawer.includes("alert.detection_summary") &&
        s.integrityDrawer.includes("alert.detection_metric") &&
        s.integrityDrawer.includes("alert.source_view") &&
        s.integrityDrawer.includes("alert.created_at"),
    ],
    [
      "integrity alert drawer links related loads and work orders",
      s.integrityDrawer.includes("alert.related_load_ids") &&
        s.integrityDrawer.includes("alert.related_wo_ids") &&
        s.integrityDrawer.includes('kind="load"') &&
        s.integrityDrawer.includes('kind="work_order"'),
    ],
    [
      "integrity alerts list seeds subject filters from URL",
      s.integrityPage.includes('searchParams.get("subject_driver_id")') &&
        s.integrityPage.includes('searchParams.get("subject_unit_id")') &&
        s.integrityPage.includes("setDriverFilter"),
    ],
    [
      "anomaly subject id filter",
      s.anomalyRoutes.includes("subject_id: z.string().uuid().optional()") &&
        s.anomalyRoutes.includes("subject_id = $${values.length}::uuid"),
    ],
    [
      "all applicable profile consumers",
      ["driver", "unit", "vendor", "customer", "invoice"].every((kind) =>
        s.profiles.includes(`subjectKind=\"${kind}\"`),
      ),
    ],
    [
      "canonical driver detail Safety File mounts safety alert reverse",
      s.canonicalDriverDetail.includes(
        '<SafetyAlertsReverseSection\n                    operatingCompanyId={String(driver.operating_company_id)}\n                    subjectKind="driver"\n                    subjectId={id}',
      ),
    ],
    [
      "exact three record targets",
      s.section.includes("<EntityLinkOrTombstone") &&
        s.section.includes('kind="company_violation"') &&
        s.section.includes('kind="integrity_alert"') &&
        s.section.includes("id={row.id == null ? null : String(row.id)}") &&
        s.section.includes('noun="Company violation"') &&
        s.section.includes('noun="Integrity alert"') &&
        s.section.includes('kind="integrity_anomaly"') &&
        s.entityLink.includes('case "company_violation":') &&
        s.entityLink.includes(
          "/safety/external-fines?record_type=company-violation&violation_id=",
        ) &&
        s.entityLink.includes("/safety/integrity-alerts?alert_id=") &&
        s.entityLink.includes("/safety/integrity-reports?anomaly_id="),
    ],
    [
      "failed reverse reads suppress cached safety rows",
      s.section.includes("const violations = failed ? [] :") &&
        s.section.includes("const alerts = failed ? [] :") &&
        s.section.includes("const anomalies = failed ? [] :"),
    ],
    [
      "target drawers honor ids",
      s.companyPage.includes('searchParams.get("violation_id")') &&
        s.integrityPage.includes('searchParams.get("alert_id")') &&
        s.anomalyPage.includes('searchParams.get("anomaly_id")') &&
        s.integrityReports.includes('searchParams.get("anomaly_id")'),
    ],
    // LST-F5163G: list chrome reverse (URL-only driver_id/unit_id is not enough).
    [
      "company violation list EntityPicker driver/unit filters",
      s.companyPage.includes('dataTestId="company-violations-filter-driver"') &&
        s.companyPage.includes('dataTestId="company-violations-filter-unit"') &&
        s.companyPage.includes("allowCreate={false}"),
    ],
    [
      "company violation list Driver/Unit EntityLink columns",
      s.companyPage.includes('label: "Driver"') &&
        s.companyPage.includes('label: "Unit"') &&
        s.companyPage.includes('kind="driver"') &&
        s.companyPage.includes('kind="unit"'),
    ],
    [
      "company violation list seeds filters from URL",
      s.companyPage.includes('searchParams.get("driver_id")') &&
        s.companyPage.includes('searchParams.get("unit_id")') &&
        s.companyPage.includes("setDriverFilter") &&
        s.companyPage.includes("setUnitFilter"),
    ],
    // LST-F5191 — filters must write URL, not local-only.
    [
      "company violation list writes filters to URL",
      s.companyPage.includes("setSearchParams"),
    ],
    [
      "company violation unit forward links",
      s.companyDrawer.includes("violation.related_unit_ids") &&
        s.companyDrawer.includes('kind="unit" id={unitId}'),
    ],
    [
      "company violation human label projections",
      (s.companyRoutes.match(/AS related_driver_labels/g) ?? []).length === 2 &&
        (s.companyRoutes.match(/AS related_unit_labels/g) ?? []).length === 2,
    ],
    [
      "company violation driver label tenant joins",
      (
        s.companyRoutes.match(
          /md\.operating_company_id = cv\.operating_company_id/g,
        ) ?? []
      ).length === 2,
    ],
    [
      "company violation exact-driver parent authorization",
      /dca\.company_id = \$2::uuid[\s\S]{0,160}dca\.is_authorized = true[\s\S]{0,160}dca\.deactivated_at IS NULL/.test(
        s.companyRoutes,
      ),
    ],
    [
      "company violation authorized driver labels",
      (
        s.companyRoutes.match(
          /label_dca\.company_id = cv\.operating_company_id/g,
        ) ?? []
      ).length === 2 &&
        (s.companyRoutes.match(/label_dca\.is_authorized = true/g) ?? [])
          .length === 2,
    ],
  [
    "company violation invalid driver is not false empty",
    /if \(!result\.found\)\s*return reply\.code\(404\)\.send\(\{ error: "mdata_driver_not_found" \}\)/.test(
      s.companyRoutes,
    ),
    ],
    [
      "company violation unit label owner/lease joins",
      (
        s.companyRoutes.match(
          /COALESCE\(mu\.currently_leased_to_company_id, mu\.owner_company_id\) = cv\.operating_company_id/g,
        ) ?? []
      ).length === 2,
    ],
    [
      "company violation drawer consumes labels",
      s.companyDrawer.includes(
        'entityLabel(driverLabels[driverId], driverId, "Driver")',
      ) &&
        s.companyDrawer.includes(
          'entityLabel(unitLabels[unitId], unitId, "Unit")',
        ),
    ],
  ]
    .filter(([, ok]) => !ok)
    .map(([name]) => name);
}
if (process.argv.includes("--selftest")) {
  const checks = [
    failures({
      ...files,
      section: files.section.replace("const violations = failed ? [] :", "const violations ="),
    }).includes("failed reverse reads suppress cached safety rows"),
    failures({
      ...files,
      companyRoutes: files.companyRoutes.replaceAll(
        "d.driver_id = $2::uuid",
        "TRUE",
      ),
    }).includes("company violation driver/unit reverse filters"),
    failures({
      ...files,
      integrityRoutes: files.integrityRoutes.replace(
        '"subject_driver_id", "subject_unit_id", "subject_vendor_id"',
        '"subject_type"',
      ),
    }).includes("integrity alert subject FK filters"),
    failures({
      ...files,
      integrityRoutes: files.integrityRoutes.replaceAll(
        "AS subject_driver_name",
        "AS hidden_driver_name",
      ),
    }).includes("integrity alert human label projections"),
    failures({
      ...files,
      integrityRoutes: files.integrityRoutes.replaceAll(
        "d.operating_company_id = ia.operating_company_id",
        "TRUE",
      ),
    }).includes("integrity alert driver/vendor tenant joins"),
    failures({
      ...files,
      integrityRoutes: files.integrityRoutes.replaceAll(
        "u.owner_company_id = ia.operating_company_id",
        "TRUE",
      ),
    }).includes("integrity alert unit owner lease joins"),
    failures({
      ...files,
      integrityPage: files.integrityPage.replace(
        'dataTestId="integrity-alerts-filter-driver"',
        'dataTestId="x"',
      ),
    }).includes("integrity alerts list EntityPicker subject filters"),
    failures({
      ...files,
      integrityPage: files.integrityPage.replace(
        'label: "Linked to"',
        'label: "X"',
      ),
    }).includes("integrity alerts list Linked-to EntityLink column"),
    failures({
      ...files,
      integrityPage: files.integrityPage.replace(
        "evaluateIntegrityAlerts(input.companyId)",
        "Promise.resolve()",
      ),
    }).includes("integrity evaluator refreshes the canonical inbox"),
    failures({
      ...files,
      integrityPage: files.integrityPage.replace(
        "onClick={() => setSelected(row)}",
        "onClick={() => undefined}",
      ),
    }).includes("integrity alert rows open the real selected-record drawer"),
    failures({
      ...files,
      integrityDrawer: files.integrityDrawer.replace(
        "alert.detection_summary",
        '"Unavailable"',
      ),
    }).includes("integrity alert drawer renders the canonical record payload"),
    failures({
      ...files,
      integrityDrawer: files.integrityDrawer.replace(
        'kind="work_order"',
        'kind="load"',
      ),
    }).includes("integrity alert drawer links related loads and work orders"),
    failures({
      ...files,
      integrityPage: files.integrityPage.replaceAll("setDriverFilter", "noop"),
    }).includes("integrity alerts list seeds subject filters from URL"),
    failures({
      ...files,
      anomalyRoutes: files.anomalyRoutes.replace(
        "subject_id = $${values.length}::uuid",
        "TRUE",
      ),
    }).includes("anomaly subject id filter"),
    failures({
      ...files,
      profiles: files.profiles.replace(
        'subjectKind="invoice"',
        'subjectKind="record"',
      ),
    }).includes("all applicable profile consumers"),
    failures({
      ...files,
      canonicalDriverDetail: files.canonicalDriverDetail.replace(
        '<SafetyAlertsReverseSection\n                    operatingCompanyId={String(driver.operating_company_id)}',
        "<MissingSafetyAlertsReverseSection",
      ),
    }).includes("canonical driver detail Safety File mounts safety alert reverse"),
    failures({
      ...files,
      section: files.section.replace('kind="integrity_alert"', 'kind="unit"'),
    }).includes("exact three record targets"),
    failures({
      ...files,
      section: files.section.replace(
        'noun="Company violation"',
        'noun="Record"',
      ),
    }).includes("exact three record targets"),
    failures({
      ...files,
      companyPage: files.companyPage.replace(
        'searchParams.get("violation_id")',
        "null",
      ),
    }).includes("target drawers honor ids"),
    failures({
      ...files,
      companyPage: files.companyPage.replace(
        'dataTestId="company-violations-filter-driver"',
        'dataTestId="x"',
      ),
    }).includes("company violation list EntityPicker driver/unit filters"),
    failures({
      ...files,
      companyPage: files.companyPage.replace('label: "Driver"', 'label: "X"'),
    }).includes("company violation list Driver/Unit EntityLink columns"),
    failures({
      ...files,
      companyPage: files.companyPage.replaceAll("setDriverFilter", "noop"),
    }).includes("company violation list seeds filters from URL"),
    failures({
      ...files,
      companyPage: files.companyPage.replaceAll("setSearchParams", "noop"),
    }).includes("company violation list writes filters to URL"),
    failures({
      ...files,
      companyDrawer: files.companyDrawer.replace(
        'kind="unit" id={unitId}',
        'kind="driver" id={unitId}',
      ),
    }).includes("company violation unit forward links"),
    failures({
      ...files,
      companyRoutes: files.companyRoutes.replace(
        "AS related_driver_labels",
        "AS unresolved_driver_labels",
      ),
    }).includes("company violation human label projections"),
    failures({
      ...files,
      companyRoutes: files.companyRoutes.replace(
        "md.operating_company_id = cv.operating_company_id",
        "TRUE",
      ),
    }).includes("company violation driver label tenant joins"),
    failures({
      ...files,
      companyRoutes: files.companyRoutes.replace(
        "dca.is_authorized = true",
        "TRUE",
      ),
    }).includes("company violation exact-driver parent authorization"),
    failures({
      ...files,
      companyRoutes: files.companyRoutes.replace(
        "label_dca.is_authorized = true",
        "TRUE",
      ),
    }).includes("company violation authorized driver labels"),
    failures({
      ...files,
      companyRoutes: files.companyRoutes.replace(
        /if \(!result\.found\)\s*return reply\.code\(404\)/,
        "if (false) return reply.code(404)",
      ),
    }).includes("company violation invalid driver is not false empty"),
    failures({
      ...files,
      companyRoutes: files.companyRoutes.replace(
        "COALESCE(mu.currently_leased_to_company_id, mu.owner_company_id) = cv.operating_company_id",
        "TRUE",
      ),
    }).includes("company violation unit label owner/lease joins"),
    failures({
      ...files,
      companyDrawer: files.companyDrawer.replace(
        "driverLabels[driverId]",
        "undefined",
      ),
    }).includes("company violation drawer consumes labels"),
  ];
  if (checks.some((ok) => !ok)) {
    console.error(
      `verify-safety-alert-profile-reverse selftest FAIL — mutations ${checks
        .map((ok, i) => (ok ? null : i + 1))
        .filter(Boolean)
        .join(", ")} stayed green`,
    );
    process.exit(1);
  }
  console.log(
    `verify-safety-alert-profile-reverse selftest PASS — ${checks.length}/${checks.length} API/profile/label/target mutations red`,
  );
  process.exit(0);
}
const missing = failures();
if (missing.length) {
  console.error(
    `verify-safety-alert-profile-reverse FAIL — ${missing.join(", ")}`,
  );
  process.exit(1);
}
console.log(
  "verify-safety-alert-profile-reverse PASS — five subject profiles resolve exact safety drawers",
);
