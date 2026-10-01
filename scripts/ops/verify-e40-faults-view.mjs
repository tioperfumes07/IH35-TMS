#!/usr/bin/env node
/**
 * E-40 — Maintenance FAULTS view (Round 306). Ops lane; --selftest.
 * Asserts FE consumer of GET /api/v1/maintenance/fault-code-alerts is fully wired:
 * API client · page · manifest routes (+ :id deep-link) · nav · EntityLink reverse · arch.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LABEL = "verify-e40-faults-view";
const SELFTEST = process.argv.includes("--selftest");

const FILES = {
  api: "apps/frontend/src/api/maintenance.ts",
  page: "apps/frontend/src/pages/maintenance/FaultCodeAlertsPage.tsx",
  manifest: "apps/frontend/src/routes/manifest.tsx",
  nav: "apps/frontend/src/components/maintenance/MAINTENANCE_NAV_CONFIG.ts",
  entityLink: "apps/frontend/src/components/shared/EntityLink.tsx",
  snapshot: "apps/frontend/src/components/vehicle-profile/MaintenanceSnapshotSection.tsx",
  arch: "docs/specs/IH35_ARCHITECTURAL_DESIGN.md",
  beRoute: "apps/backend/src/maintenance/fault-code-alerts.routes.ts",
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function audit() {
  const f = [];
  const api = read(FILES.api);
  if (!/export function listFaultCodeAlerts/.test(api)) f.push(`${FILES.api}: missing listFaultCodeAlerts`);
  if (!/\/api\/v1\/maintenance\/fault-code-alerts/.test(api)) f.push(`${FILES.api}: must call fault-code-alerts`);

  const page = read(FILES.page);
  if (!/listFaultCodeAlerts/.test(page)) f.push(`${FILES.page}: must call listFaultCodeAlerts`);
  if (!/data-testid="fault-code-alerts-page"/.test(page)) f.push(`${FILES.page}: missing page testid`);
  if (!/fault-code-alerts-filter-unit/.test(page) || !/fault-code-alerts-filter-driver/.test(page)) {
    f.push(`${FILES.page}: must expose unit + driver filters`);
  }
  if (!/EntityLinkOrTombstone kind="work_order"/.test(page) || !/kind="unit"/.test(page) || !/kind="driver"/.test(page)) {
    f.push(`${FILES.page}: must EntityLink unit · driver · work_order`);
  }

  const manifest = read(FILES.manifest);
  if (!/path="\/maintenance\/fault-code-alerts"/.test(manifest)) f.push(`${FILES.manifest}: missing list route`);
  if (!/path="\/maintenance\/fault-code-alerts\/:id"/.test(manifest)) f.push(`${FILES.manifest}: missing :id deep-link route`);
  if (!/FaultCodeAlertsPage/.test(manifest)) f.push(`${FILES.manifest}: must lazy-load FaultCodeAlertsPage`);

  const nav = read(FILES.nav);
  if (!/label: "Faults", path: "\/maintenance\/fault-code-alerts"/.test(nav)) {
    f.push(`${FILES.nav}: Faults must be in nav`);
  }
  const moduleCount = (nav.match(/MAINTENANCE_MODULE_NAV_LINKS[\s\S]*?\];/)?.[0].match(/path:/g) ?? []).length;
  if (moduleCount !== 14) f.push(`${FILES.nav}: MAINTENANCE_MODULE_NAV_LINKS must be 14 (got ${moduleCount})`);

  const entityLink = read(FILES.entityLink);
  if (!/fault_code_alerts_unit/.test(entityLink) || !/fault_code_alerts_driver/.test(entityLink)) {
    f.push(`${FILES.entityLink}: missing fault_code_alerts_unit/driver kinds`);
  }
  if (!/\/maintenance\/fault-code-alerts\?unit_id=/.test(entityLink)) {
    f.push(`${FILES.entityLink}: fault_code_alerts_unit must deep-link unit_id`);
  }

  const snapshot = read(FILES.snapshot);
  if (!/kind="fault_code_alerts_unit"/.test(snapshot)) {
    f.push(`${FILES.snapshot}: View fault history must link fault_code_alerts_unit`);
  }

  const arch = read(FILES.arch);
  if (!/\/maintenance\/fault-code-alerts/.test(arch) || !/\bFaults\b/.test(arch)) {
    f.push(`${FILES.arch}: must document Faults / fault-code-alerts`);
  }
  if (!/14 sidebar flyout/.test(arch)) f.push(`${FILES.arch}: must document 14 sidebar flyout links`);

  const be = read(FILES.beRoute);
  if (!/\/api\/v1\/maintenance\/fault-code-alerts/.test(be)) f.push(`${FILES.beRoute}: backend route missing`);

  return f;
}

if (SELFTEST) {
  const failures = audit();
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAIL:`);
    for (const x of failures) console.error(`  - ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const failures = audit();
if (failures.length) {
  console.error(`${LABEL} FAIL:`);
  for (const x of failures) console.error(`  - ${x}`);
  process.exit(1);
}
console.log(`${LABEL}: OK`);
process.exit(0);
