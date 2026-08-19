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
  migration: read("db/migrations/202612601200_system_audit_master_data_spine_subjects.sql"),
  emitter: read("apps/backend/src/mdata/master-data-spine-emit.ts"),
  customerRoute: read("apps/backend/src/mdata/customers.routes.ts"),
  vendorRoute: read("apps/backend/src/mdata/vendors.routes.ts"),
  driverRoute: read("apps/backend/src/mdata/drivers.routes.ts"),
  unitRoute: read("apps/backend/src/mdata/units.routes.ts"),
};
function failures(s = files) { return [
  ["company-scoped exact audit filter", s.routes.includes("audit_event_id: z.string().uuid().optional()") && s.routes.includes("e.uuid = $${values.length}::uuid") && s.api.includes('search.set("audit_event_id", params.auditEventId)')],
  ["profile row exact drill", s.history.includes('kind="audit_event"') && s.history.includes("id={row.id}")],
  ["system page honors exact record", s.page.includes('searchParams.get("audit_event_id")') && s.page.includes("listAuditEvents({ operatingCompanyId: companyId, auditEventId, limit: 1 })") && s.page.includes('data-testid="audit-trail-exact-event"')],
  ["honest selected-record states", s.page.includes("Selected audit event unavailable.") && s.page.includes("Audit event not found for this operating company.")],
  // ACCT-F5560: real code migrated the raw <EntityLink>/entityLabel(...) calls this guard originally
  // pinned to the shared EntityLinkOrTombstone component (same honest tombstone-then-link guarantee,
  // different literal call shape — same class fixed repeatedly this session, e.g. ACCT-F5552). Accept
  // either shape rather than pin to the pre-refactor one.
  ["selected actor canonical drill", s.page.includes('<EntityLink kind="user" id={exactAuditEvent.actor_user_id}') || s.page.includes('kind="user" id={exactAuditEvent.actor_user_id}')],
  ["spine subject human labels", s.spine.includes("END                          AS subject_label") && s.api.includes("subject_label: string | null") && (s.page.includes("entityLabel(row.subject_label, row.subject_id, \"Subject\")") || s.page.includes('name={row.subject_label} noun="Subject"')) && s.page.includes('row.subject_label ?? "Subject label unavailable"') && s.page.includes('"subject_label"') && s.page.includes('e.subject_label ?? ""')],
  ["historical task subjects derive canonical kind", s.spine.includes("el.subject_type = 'task' AND el.source_table = 'maintenance.work_orders' THEN 'work_order'") && s.spine.includes("el.subject_type = 'task' AND el.source_table = 'accounting.invoices' THEN 'invoice'") && s.spine.includes("el.subject_type = 'task' AND el.source_table = 'accounting.bills' THEN 'bill'") && s.api.includes("subject_kind: string | null") && s.page.includes("row.subject_kind ?? row.subject_type")],
  ["work-order subject same-company label", s.spine.includes("wo.id = el.source_reference_id") && s.spine.includes("wo.operating_company_id = el.operating_company_id") && s.spine.includes("NULLIF(TRIM(wo.display_id), '')") && s.page.includes('work_order: "work_order"')],
  ["invoice subject same-company label", s.spine.includes("i.id = el.source_reference_id") && s.spine.includes("i.operating_company_id = el.operating_company_id") && s.spine.includes("NULLIF(TRIM(i.display_id), '')") && s.page.includes('invoice: "invoice"')],
  ["bill subject same-company label", s.spine.includes("b.id = el.source_reference_id") && s.spine.includes("b.operating_company_id = el.operating_company_id") && s.spine.includes("COALESCE(b.display_id, b.bill_number)") && s.page.includes('bill: "bill"')],
  ["load subject same-company join", s.spine.includes("l.operating_company_id = el.operating_company_id")],
  ["driver subject same-company join", s.spine.includes("d.operating_company_id = el.operating_company_id")],
  ["unit subject effective-company join", s.spine.includes("COALESCE(un.currently_leased_to_company_id, un.owner_company_id) = el.operating_company_id")],
  ["customer spine subject allowed", s.migration.includes("'customer', 'vendor'")],
  ["vendor spine subject allowed", s.migration.includes("'customer', 'vendor'") && s.migration.includes("p_subject_type NOT IN")],
  ["shared master-data spine emitter", s.emitter.includes("events.log_event(") && s.emitter.includes('customer: "mdata.customers"') && s.emitter.includes('vendor: "mdata.vendors"') && s.emitter.includes('driver: "mdata.drivers"') && s.emitter.includes('unit: "mdata.units"')],
  ["customer create emits spine atomically", s.customerRoute.includes("emitMasterDataCreatedSpineEvent(client, {") && s.customerRoute.includes('subject_type: "customer"')],
  ["vendor create emits spine atomically", s.vendorRoute.includes("emitMasterDataCreatedSpineEvent(client, {") && s.vendorRoute.includes('subject_type: "vendor"')],
  ["driver create emits spine atomically", s.driverRoute.includes("emitMasterDataCreatedSpineEvent(client, {") && s.driverRoute.includes('subject_type: "driver"')],
  ["unit create emits spine with effective company", s.unitRoute.includes("emitMasterDataCreatedSpineEvent(client, {") && s.unitRoute.includes("String(resolvedLeasedId ?? resolvedOwnerId)") && s.unitRoute.includes('subject_type: "unit"')],
  ["customer subject same-company label", s.spine.includes("c.operating_company_id = el.operating_company_id") && s.spine.includes("NULLIF(TRIM(c.customer_name), '')")],
  ["vendor subject same-company label", s.spine.includes("v.operating_company_id = el.operating_company_id") && s.spine.includes("NULLIF(TRIM(v.vendor_name), '')")],
  ["customer source drill", s.page.includes('t === "mdata.customers"') && s.page.includes('return `/customers/${id}`')],
  ["vendor source drill", s.page.includes('t === "mdata.vendors"') && s.page.includes('return `/vendors/${id}`')],
  ["driver source drill", s.page.includes('t === "mdata.drivers"') && s.page.includes('return `/drivers/${id}`')],
  ["unit source drill", s.page.includes('t === "mdata.units"') && s.page.includes('return `/fleet/units/${id}`')],
  ["all canonical history mounts remain", [s.driver, s.unit, s.trailer, s.vendor, s.customer, s.workOrder, s.load].every((source) => source.includes("<EntityAuditHistoryTab"))],
].filter(([, ok]) => !ok).map(([name]) => name); }
if (process.argv.includes("--selftest")) {
  const checks = [
    failures({ ...files, routes: files.routes.replace("e.uuid = $${values.length}::uuid", "TRUE") }).includes("company-scoped exact audit filter"),
    failures({ ...files, history: files.history.replace('kind="audit_event"', 'kind="user"') }).includes("profile row exact drill"),
    failures({ ...files, page: files.page.replace("auditEventId, limit: 1", "limit: 1") }).includes("system page honors exact record"),
    failures({ ...files, page: files.page.replace("Audit event not found for this operating company.", "No events") }).includes("honest selected-record states"),
    failures({ ...files, page: files.page.replace('kind="user" id={exactAuditEvent.actor_user_id}', 'kind="unit" id={exactAuditEvent.actor_user_id}') }).includes("selected actor canonical drill"),
    failures({ ...files, page: files.page.replace('name={row.subject_label} noun="Subject"', 'name={null} noun="Subject"') }).includes("spine subject human labels"),
    failures({ ...files, spine: files.spine.replace("el.subject_type = 'task' AND el.source_table = 'maintenance.work_orders' THEN 'work_order'", "FALSE THEN 'work_order'") }).includes("historical task subjects derive canonical kind"),
    failures({ ...files, spine: files.spine.replace("wo.operating_company_id = el.operating_company_id", "TRUE") }).includes("work-order subject same-company label"),
    failures({ ...files, spine: files.spine.replace("i.operating_company_id = el.operating_company_id", "TRUE") }).includes("invoice subject same-company label"),
    failures({ ...files, spine: files.spine.replace("b.operating_company_id = el.operating_company_id", "TRUE") }).includes("bill subject same-company label"),
    failures({ ...files, spine: files.spine.replace("l.operating_company_id = el.operating_company_id", "TRUE") }).includes("load subject same-company join"),
    failures({ ...files, spine: files.spine.replace("d.operating_company_id = el.operating_company_id", "TRUE") }).includes("driver subject same-company join"),
    failures({ ...files, spine: files.spine.replace("COALESCE(un.currently_leased_to_company_id, un.owner_company_id) = el.operating_company_id", "TRUE") }).includes("unit subject effective-company join"),
    failures({ ...files, migration: files.migration.replaceAll("'customer', 'vendor'", "'customer_unused', 'vendor'") }).includes("customer spine subject allowed"),
    failures({ ...files, migration: files.migration.replaceAll("'customer', 'vendor'", "'customer', 'vendor_unused'") }).includes("vendor spine subject allowed"),
    failures({ ...files, emitter: files.emitter.replace("events.log_event(", "events.log_event_unused(") }).includes("shared master-data spine emitter"),
    failures({ ...files, customerRoute: files.customerRoute.replace('subject_type: "customer"', 'subject_type: "driver"') }).includes("customer create emits spine atomically"),
    failures({ ...files, vendorRoute: files.vendorRoute.replace('subject_type: "vendor"', 'subject_type: "driver"') }).includes("vendor create emits spine atomically"),
    failures({ ...files, driverRoute: files.driverRoute.replace('subject_type: "driver"', 'subject_type: "unit"') }).includes("driver create emits spine atomically"),
    failures({ ...files, unitRoute: files.unitRoute.replace("String(resolvedLeasedId ?? resolvedOwnerId)", "String(resolvedOwnerId)") }).includes("unit create emits spine with effective company"),
    failures({ ...files, spine: files.spine.replace("c.operating_company_id = el.operating_company_id", "TRUE") }).includes("customer subject same-company label"),
    failures({ ...files, spine: files.spine.replace("v.operating_company_id = el.operating_company_id", "TRUE") }).includes("vendor subject same-company label"),
    failures({ ...files, page: files.page.replace('t === "mdata.customers"', 't === "mdata.customers_unused"') }).includes("customer source drill"),
    failures({ ...files, page: files.page.replace('t === "mdata.vendors"', 't === "mdata.vendors_unused"') }).includes("vendor source drill"),
    failures({ ...files, page: files.page.replace('t === "mdata.drivers"', 't === "mdata.drivers_unused"') }).includes("driver source drill"),
    failures({ ...files, page: files.page.replace('t === "mdata.units"', 't === "mdata.units_unused"') }).includes("unit source drill"),
    failures({ ...files, load: "" }).includes("all canonical history mounts remain"),
  ];
  if (checks.some((ok) => !ok)) { console.error(`verify-system-audit-record-reverse selftest FAIL — mutations ${checks.map((ok, i) => ok ? null : i + 1).filter(Boolean).join(", ")} stayed green`); process.exit(1); }
  console.log("verify-system-audit-record-reverse selftest PASS — 27/27 filter/profile/emitter/target/state/subject-label mutations red"); process.exit(0);
}
const missing = failures();
if (missing.length) { console.error(`verify-system-audit-record-reverse FAIL — ${missing.join(", ")}`); process.exit(1); }
console.log("verify-system-audit-record-reverse PASS — exact audit drills plus atomic customer/vendor/driver/unit spine emits and same-company labels are wired");
