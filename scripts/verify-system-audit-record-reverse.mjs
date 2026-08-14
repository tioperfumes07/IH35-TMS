#!/usr/bin/env node
/** @matrix-built {"modules":["system"],"cols":["reverse_link"],"leafRe":"^audit\\.trail$","task":"VERTICAL-REVERSE-LINK-SYSTEM-AUDIT-RECORD"} */
import fs from "node:fs";
const read = (path) => fs.readFileSync(path, "utf8");
const files = {
  routes: read("apps/backend/src/audit/audit-events-list.routes.ts"),
  api: read("apps/frontend/src/api/audit.ts"),
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
  ["profile row exact drill", s.history.includes('/audit/trail?audit_event_id=${encodeURIComponent(row.id)}')],
  ["system page honors exact record", s.page.includes('searchParams.get("audit_event_id")') && s.page.includes("listAuditEvents({ operatingCompanyId: companyId, auditEventId, limit: 1 })") && s.page.includes('data-testid="audit-trail-exact-event"')],
  ["honest selected-record states", s.page.includes("Selected audit event unavailable.") && s.page.includes("Audit event not found for this operating company.")],
  ["selected actor canonical drill", s.page.includes('<EntityLink kind="user" id={exactAuditEvent.actor_user_id}')],
  ["all canonical history mounts remain", [s.driver, s.unit, s.trailer, s.vendor, s.customer, s.workOrder, s.load].every((source) => source.includes("<EntityAuditHistoryTab"))],
].filter(([, ok]) => !ok).map(([name]) => name); }
if (process.argv.includes("--selftest")) {
  const checks = [
    failures({ ...files, routes: files.routes.replace("e.uuid = $${values.length}::uuid", "TRUE") }).includes("company-scoped exact audit filter"),
    failures({ ...files, history: files.history.replace("audit_event_id=${encodeURIComponent(row.id)}", "") }).includes("profile row exact drill"),
    failures({ ...files, page: files.page.replace("auditEventId, limit: 1", "limit: 1") }).includes("system page honors exact record"),
    failures({ ...files, page: files.page.replace("Audit event not found for this operating company.", "No events") }).includes("honest selected-record states"),
    failures({ ...files, page: files.page.replace('<EntityLink kind="user" id={exactAuditEvent.actor_user_id}', '<span data-user={exactAuditEvent.actor_user_id}') }).includes("selected actor canonical drill"),
    failures({ ...files, load: "" }).includes("all canonical history mounts remain"),
  ];
  if (checks.some((ok) => !ok)) { console.error(`verify-system-audit-record-reverse selftest FAIL — mutations ${checks.map((ok, i) => ok ? null : i + 1).filter(Boolean).join(", ")} stayed green`); process.exit(1); }
  console.log("verify-system-audit-record-reverse selftest PASS — 6/6 filter/profile/target/state mutations red"); process.exit(0);
}
const missing = failures();
if (missing.length) { console.error(`verify-system-audit-record-reverse FAIL — ${missing.join(", ")}`); process.exit(1); }
console.log("verify-system-audit-record-reverse PASS — every mounted profile history drills to its exact company-scoped audit record");
