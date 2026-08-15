#!/usr/bin/env node
/** @matrix-built {"modules":["system"],"cols":["reverse_link"],"leafRe":"^audit\\.trail$","task":"VERTICAL-REVERSE-LINK-SYSTEM-AUDIT-RECORD"} */
import fs from "node:fs";
const read = (path) => fs.readFileSync(path, "utf8");
const files = {
  spine: read("apps/backend/src/audit/spine-events.routes.ts"),
  api: read("apps/frontend/src/api/audit.ts"),
  routes: read("apps/backend/src/audit/audit-events-list.routes.ts"),
  history: read("apps/frontend/src/components/audit/EntityAuditHistoryTab.tsx"),
  page: read("apps/frontend/src/pages/audit/AuditTrailPage.tsx"),
  driver: read("apps/frontend/src/pages/drivers/DriverProfilePage.tsx"),
  unit: read("apps/frontend/src/pages/fleet/VehicleProfilePage.tsx"),
  trailer: read("apps/frontend/src/pages/fleet/TrailerProfilePage.tsx"),
  vendor: read("apps/frontend/src/pages/VendorDetail.tsx"),
  customer: read("apps/frontend/src/pages/CustomerDetail.tsx"),
  workOrder: read("apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx"),
  load: read("apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx"),
};
function failures(s = files) { return [
  ["company-scoped exact audit filter", s.routes.includes("audit_event_id: z.string().uuid().optional()") && s.routes.includes("e.uuid = $${values.length}::uuid") && s.api.includes('search.set("audit_event_id", params.auditEventId)')],
  ["profile row exact drill", s.history.includes('kind="audit_event"') && s.history.includes("id={row.id}")],
  ["system page honors exact record", s.page.includes('searchParams.get("audit_event_id")') && s.page.includes("listAuditEvents({ operatingCompanyId: companyId, auditEventId, limit: 1 })") && s.page.includes('data-testid="audit-trail-exact-event"')],
  ["honest selected-record states", s.page.includes("Selected audit event unavailable.") && s.page.includes("Audit event not found for this operating company.")],
  ["selected actor canonical drill", s.page.includes('<EntityLink kind="user" id={exactAuditEvent.actor_user_id}')],
  ["spine subject human labels", s.spine.includes("END                          AS subject_label") && s.api.includes("subject_label: string | null") && s.page.includes("entityLabel(row.subject_label, row.subject_id, \"Subject\")") && s.page.includes('row.subject_label ?? "Subject label unavailable"') && s.page.includes('"subject_label"') && s.page.includes('e.subject_label ?? ""')],
  ["load subject same-company join", s.spine.includes("l.operating_company_id = el.operating_company_id")],
  ["driver subject same-company join", s.spine.includes("d.operating_company_id = el.operating_company_id")],
  ["unit subject effective-company join", s.spine.includes("COALESCE(un.currently_leased_to_company_id, un.owner_company_id) = el.operating_company_id")],
  ["all canonical history mounts remain", [s.driver, s.unit, s.trailer, s.vendor, s.customer, s.workOrder, s.load].every((source) => source.includes("<EntityAuditHistoryTab"))],
].filter(([, ok]) => !ok).map(([name]) => name); }
if (process.argv.includes("--selftest")) {
  const checks = [
    failures({ ...files, routes: files.routes.replace("e.uuid = $${values.length}::uuid", "TRUE") }).includes("company-scoped exact audit filter"),
    failures({ ...files, history: files.history.replace('kind="audit_event"', 'kind="user"') }).includes("profile row exact drill"),
    failures({ ...files, page: files.page.replace("auditEventId, limit: 1", "limit: 1") }).includes("system page honors exact record"),
    failures({ ...files, page: files.page.replace("Audit event not found for this operating company.", "No events") }).includes("honest selected-record states"),
    failures({ ...files, page: files.page.replace('<EntityLink kind="user" id={exactAuditEvent.actor_user_id}', '<span data-user={exactAuditEvent.actor_user_id}') }).includes("selected actor canonical drill"),
    failures({ ...files, page: files.page.replaceAll("entityLabel(row.subject_label, row.subject_id, \"Subject\")", "entityLabel(null, row.subject_id, \"Subject\")") }).includes("spine subject human labels"),
    failures({ ...files, spine: files.spine.replace("l.operating_company_id = el.operating_company_id", "TRUE") }).includes("load subject same-company join"),
    failures({ ...files, spine: files.spine.replace("d.operating_company_id = el.operating_company_id", "TRUE") }).includes("driver subject same-company join"),
    failures({ ...files, spine: files.spine.replace("COALESCE(un.currently_leased_to_company_id, un.owner_company_id) = el.operating_company_id", "TRUE") }).includes("unit subject effective-company join"),
    failures({ ...files, load: "" }).includes("all canonical history mounts remain"),
  ];
  if (checks.some((ok) => !ok)) { console.error(`verify-system-audit-record-reverse selftest FAIL — mutations ${checks.map((ok, i) => ok ? null : i + 1).filter(Boolean).join(", ")} stayed green`); process.exit(1); }
  console.log("verify-system-audit-record-reverse selftest PASS — 10/10 filter/profile/target/state/subject-label mutations red"); process.exit(0);
}
const missing = failures();
if (missing.length) { console.error(`verify-system-audit-record-reverse FAIL — ${missing.join(", ")}`); process.exit(1); }
console.log("verify-system-audit-record-reverse PASS — exact audit drills and canonical same-company load/driver/unit subject labels are wired");
