#!/usr/bin/env node
/**
 * verify-maintenance-services-catalog-editable.mjs  (CLOSURE-11-EDIT)
 *
 * Root cause: apps/backend/src/catalogs/maintenance/services.routes.ts shipped list+create only
 * (CLOSURE-11) -- there was never a PATCH or DELETE route, and the frontend page rendered no
 * Edit/Archive/Status affordance at all for a real, reachable, non-empty table. Live-confirmed
 * 2026-08-23: read_page on the deployed Maintenance Services Catalog returned zero action buttons
 * in the accessibility tree for any row -- a maintenance service, once created, could never be
 * corrected (fix a typo, adjust pricing) or retired, with no error, no "coming soon", nothing --
 * the UI simply omitted the capability.
 *
 * This guard makes the regression impossible to re-ship:
 *   1. services.routes.ts must register a PATCH /:id route that scopes to
 *      operating_company_id in its UPDATE (never a bare `WHERE id = $1`).
 *   2. MaintenanceServicesCatalog.tsx must import useUpdateMaintenanceService and render a
 *      Status column + an Edit action per row.
 *
 * Usage:
 *   node scripts/verify-maintenance-services-catalog-editable.mjs            # scan
 *   node scripts/verify-maintenance-services-catalog-editable.mjs --selftest # regression harness -> must FAIL on bug
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const BACKEND_FILE = "apps/backend/src/catalogs/maintenance/services.routes.ts";
const FRONTEND_FILE = "apps/frontend/src/pages/lists/MaintenanceServicesCatalog.tsx";

export function checkBackendHasScopedPatch(src) {
  const offenders = [];
  if (!/app\.patch\(\s*["'`]\/api\/v1\/catalogs\/maintenance\/services-catalog\/:id["'`]/.test(src)) {
    offenders.push(`${BACKEND_FILE}: no PATCH /:id route registered — services can never be edited`);
    return offenders;
  }
  const patchIdx = src.indexOf('app.patch(');
  const slice = src.slice(patchIdx);
  if (!/UPDATE mdata\.maintenance_services SET[^`]*WHERE id = [^`]*AND operating_company_id = /s.test(slice)) {
    offenders.push(`${BACKEND_FILE}: PATCH route's UPDATE does not scope to operating_company_id — cross-tenant edit risk`);
  }
  return offenders;
}

export function checkFrontendHasEditUi(src) {
  const offenders = [];
  if (!/useUpdateMaintenanceService/.test(src)) {
    offenders.push(`${FRONTEND_FILE}: must import and use useUpdateMaintenanceService — no way to edit a service`);
  }
  if (!/label:\s*["']Status["']/.test(src)) {
    offenders.push(`${FRONTEND_FILE}: no Status column — operators can't see whether a service is active or archived`);
  }
  if (!/onClick=\{\(\) => onEdit\(svc\)\}/.test(src)) {
    offenders.push(`${FRONTEND_FILE}: no per-row Edit action wired`);
  }
  return offenders;
}

export function run() {
  const offenders = [];
  offenders.push(...checkBackendHasScopedPatch(fs.readFileSync(path.join(repoRoot, BACKEND_FILE), "utf8")));
  offenders.push(...checkFrontendHasEditUi(fs.readFileSync(path.join(repoRoot, FRONTEND_FILE), "utf8")));
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggyBackend = "app.post(basePath, async (req, reply) => { /* create only, no PATCH */ });";
  const goodBackend =
    'app.patch("/api/v1/catalogs/maintenance/services-catalog/:id", async (req, reply) => {\n' +
    "  const res = await client.query(`UPDATE mdata.maintenance_services SET x = $1 WHERE id = $2 AND operating_company_id = $3::uuid`, values);\n" +
    "});";
  const goodBackendUnscoped =
    'app.patch("/api/v1/catalogs/maintenance/services-catalog/:id", async (req, reply) => {\n' +
    "  const res = await client.query(`UPDATE mdata.maintenance_services SET x = $1 WHERE id = $2`, values);\n" +
    "});";
  const buggyFrontend = "export function MaintenanceServicesCatalog() { return <ParityTable columns={SERVICES_COLUMNS} />; }";
  const goodFrontend =
    'import { useUpdateMaintenanceService } from "../../hooks/useMaintenanceServicesCatalog";\n' +
    '{ key: "is_active", label: "Status" }\n' +
    "<Button onClick={() => onEdit(svc)}>Edit</Button>";

  const buggyBackendFails = checkBackendHasScopedPatch(buggyBackend).length > 0;
  const goodBackendPasses = checkBackendHasScopedPatch(goodBackend).length === 0;
  const unscopedBackendFails = checkBackendHasScopedPatch(goodBackendUnscoped).length > 0;
  const buggyFrontendFails = checkFrontendHasEditUi(buggyFrontend).length > 0;
  const goodFrontendPasses = checkFrontendHasEditUi(goodFrontend).length === 0;

  if (buggyBackendFails && goodBackendPasses && unscopedBackendFails && buggyFrontendFails && goodFrontendPasses) {
    console.log("verify:maintenance-services-catalog-editable selftest OK");
    process.exit(0);
  }
  console.error("verify:maintenance-services-catalog-editable selftest FAILED", {
    buggyBackendFails, goodBackendPasses, unscopedBackendFails, buggyFrontendFails, goodFrontendPasses,
  });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error("verify:maintenance-services-catalog-editable FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "));
    process.exit(1);
  }
  console.log("verify:maintenance-services-catalog-editable OK — services can be edited and deactivated, scoped to company");
}
