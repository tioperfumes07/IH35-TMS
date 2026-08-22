#!/usr/bin/env node
/**
 * DISP-F5798 — load/driver↔work-order reverse chain and WO forward drills.
 * Load/driver reads must be selected-company scoped, include non-void history,
 * and every WO/load/unit/vendor/claim drill must bind its exact FK and label.
 *
 * Self-test: node scripts/verify-load-reverse-work-orders.mjs --selftest
 */
import fs from "node:fs";

const LABEL = "verify-load-reverse-work-orders";
const F = {
  route: "apps/backend/src/maintenance/work-orders.routes.ts",
  client: "apps/frontend/src/api/maintenance.ts",
  driverSection: "apps/frontend/src/components/maintenance/DriverWorkOrdersReverseSection.tsx",
  driverDetail: "apps/frontend/src/pages/DriverDetail.tsx",
  driverProfile: "apps/frontend/src/pages/drivers/DriverProfilePage.tsx",
  loadSection: "apps/frontend/src/components/dispatch/LoadWorkOrdersReverseSection.tsx",
  drawer: "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx",
  detail: "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx",
  table: "apps/frontend/src/pages/maintenance/components/WorkOrdersTable.tsx",
  modal: "apps/frontend/src/components/maintenance/WorkOrderDetailModal.tsx",
};

const CHECKS = [
  { name: "list schema accepts load FK", file: F.route, pattern: /const listQuerySchema = z\.object\(\{[\s\S]{0,3000}load_id: z\.string\(\)\.uuid\(\)\.optional\(\)/ },
  { name: "list schema accepts driver FK", file: F.route, pattern: /const listQuerySchema = z\.object\(\{[\s\S]{0,3200}driver_id: z\.string\(\)\.uuid\(\)\.optional\(\)/ },
  { name: "list read starts selected-company scoped", file: F.route, pattern: /const values: unknown\[\] = \[q\.operating_company_id\];\s+const where: string\[\] = \["w\.operating_company_id = \$1::uuid"\]/ },
  { name: "load/driver scoped history bypasses open-only but keeps void filter", file: F.route, pattern: /else if \(q\.equipment_id \|\| q\.load_id \|\| q\.driver_id\) \{[\s\S]{0,220}where\.push\("w\.voided_at IS NULL"\)/ },
  { name: "route filters exact load FK", file: F.route, pattern: /if \(q\.load_id\) \{\s+values\.push\(q\.load_id\);\s+where\.push\(`w\.load_id = \$\$\{values\.length\}`\);\s+\}/ },
  { name: "route filters exact driver FK", file: F.route, pattern: /if \(q\.driver_id\) \{\s+values\.push\(q\.driver_id\);\s+where\.push\(`w\.driver_id = \$\$\{values\.length\}`\);\s+\}/ },
  { name: "client filtered read accepts load FK", file: F.client, pattern: /export function listWorkOrdersFiltered\([\s\S]{0,500}load_id\?: string/ },
  { name: "client filtered read accepts driver FK", file: F.client, pattern: /export function listWorkOrdersFiltered\([\s\S]{0,550}driver_id\?: string/ },
  { name: "client filtered read sends selected company", file: F.client, pattern: /export function listWorkOrdersFiltered\([\s\S]{0,700}new URLSearchParams\(\{ operating_company_id: companyId \}\)/ },
  { name: "client sends load FK", file: F.client, pattern: /export function listWorkOrdersFiltered\([\s\S]{0,1000}if \(params\.load_id\) qs\.set\("load_id", params\.load_id\)/ },
  { name: "client sends driver FK", file: F.client, pattern: /export function listWorkOrdersFiltered\([\s\S]{0,1100}if \(params\.driver_id\) qs\.set\("driver_id", params\.driver_id\)/ },
  { name: "driver reverse read binds company and driver", file: F.driverSection, pattern: /listWorkOrdersFiltered\(operatingCompanyId, \{ driver_id: driverId \}\)/ },
  { name: "driver reverse WO drill binds exact row", file: F.driverSection, pattern: /kind="work_order"\s+id=\{id \|\| null\}\s+name=\{wo\.display_id \?\? wo\.description\}/ },
  { name: "driver reverse load drill binds exact FK and human label", file: F.driverSection, pattern: /<EntityLinkOrTombstone[\s\S]{0,180}kind="load"[\s\S]{0,120}id=\{String\(wo\.load_id\)\}[\s\S]{0,120}name=\{wo\.linked_load_number\}[\s\S]{0,80}noun="Load"/ },
  { name: "legacy driver detail mounts reverse section", file: F.driverDetail, pattern: /<DriverWorkOrdersReverseSection(?![A-Za-z0-9_])/ },
  { name: "canonical driver profile mounts scoped reverse section", file: F.driverProfile, pattern: /<DriverWorkOrdersReverseSection[\s\S]{0,220}operatingCompanyId=\{companyId\}[\s\S]{0,160}driverId=\{id\}[\s\S]{0,160}data-testid="driver-profile-work-orders-reverse"/ },
  { name: "load reverse read binds company and load", file: F.loadSection, pattern: /listWorkOrdersFiltered\(operatingCompanyId, \{ load_id: loadId \}\)/ },
  { name: "load reverse section marker", file: F.loadSection, pattern: /data-testid="load-reverse-work-orders"/ },
  { name: "load reverse WO drill binds exact row", file: F.loadSection, pattern: /kind="work_order"[\s\S]{0,140}id=\{row\.id\}/ },
  { name: "load reverse unit drill binds exact FK and nullable label", file: F.loadSection, pattern: /EntityLinkOrTombstone kind="unit" id=\{row\.unit_id\} name=\{row\.unit_number \?\? null\} noun="Unit"/ },
  { name: "load drawer imports reverse section", file: F.drawer, pattern: /import \{ LoadWorkOrdersReverseSection \}/ },
  { name: "load drawer mounts exact reverse section", file: F.drawer, pattern: /<LoadWorkOrdersReverseSection(?![A-Za-z0-9_])/ },
  { name: "WO route projects claim human number", file: F.route, pattern: /ic\.claim_number AS insurance_claim_number/ },
  { name: "WO claim join is selected-company scoped", file: F.route, pattern: /ic\.tenant_id = w\.operating_company_id/ },
  { name: "client types claim human number", file: F.client, pattern: /insurance_claim_number\?: string \| null/ },
  { name: "WO detail linkage section marker", file: F.detail, pattern: /data-testid="wo-detail-linkage-section"/ },
  { name: "WO detail load drill binds exact FK", file: F.detail, pattern: /kind="load"[\s\S]{0,180}wo\.load_id/ },
  { name: "WO detail unit drill binds exact FK", file: F.detail, pattern: /<EntityLinkOrTombstone kind="unit" id=\{wo\.unit_id as string \| null\} name=\{wo\.unit_number\} noun="Unit"/ },
  { name: "WO detail vendor drill binds canonical vendor FK", file: F.detail, pattern: /kind="vendor"[\s\S]{0,220}(?:wo\.resolved_vendor_id|wo\.external_vendor_id|wo\.vendor_id)/ },
  { name: "WO detail claim drill binds exact FK and human number", file: F.detail, pattern: /<EntityLinkOrTombstone kind="claim" id=\{wo\.insurance_claim_id as string \| null\} name=\{wo\.insurance_claim_number\} noun="Claim"/ },
  { name: "WO table load column drills exact FK", file: F.table, pattern: /key: "load_id"[\s\S]{0,700}kind="load"[\s\S]{0,180}row\.load_id/ },
  { name: "WO modal load drill binds exact FK", file: F.modal, pattern: /kind="load"[\s\S]{0,180}(?:workOrder|wo)\.load_id/ },
  { name: "WO modal unit drill binds exact FK", file: F.modal, pattern: /kind="unit"[\s\S]{0,180}(?:workOrder|wo)\.unit_id/ },
];

const stripComments = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (match) => " ".repeat(match.length));

function readSources() {
  return Object.fromEntries(Object.values(F).map((file) => [file, stripComments(fs.readFileSync(file, "utf8"))]));
}

export function collectFailures(sources) {
  return CHECKS.filter(({ file, pattern }) => !pattern.test(sources[file])).map(({ name }) => name);
}

const sources = readSources();
if (process.argv.includes("--selftest")) {
  const baseline = collectFailures(sources);
  if (baseline.length) {
    console.error(`[${LABEL}] SELFTEST baseline FAIL:\n- ${baseline.join("\n- ")}`);
    process.exit(1);
  }
  const inert = [];
  for (const check of CHECKS) {
    const original = sources[check.file];
    const planted = original.replace(check.pattern, "/* planted DISP-F5798 load-WO reverse defect */");
    if (planted === original || !collectFailures({ ...sources, [check.file]: planted }).includes(check.name)) inert.push(check.name);
  }
  if (inert.length) {
    console.error(`[${LABEL}] SELFTEST FAIL: inert plants: ${inert.join(", ")}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] --selftest PASS: rejected ${CHECKS.length}/${CHECKS.length} independent load-WO reverse plants`);
  process.exit(0);
}

const failures = collectFailures(sources);
if (failures.length) {
  console.error(`[${LABEL}] FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`[${LABEL}] PASS: ${CHECKS.length} exact load/driver-WO reverse obligations ratcheted`);
