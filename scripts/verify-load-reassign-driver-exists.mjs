#!/usr/bin/env node
/**
 * DISP-REASSIGN-DRIVER-EXISTS — manual reassign must 404 when the driver is missing,
 * never leak Postgres FK 23503.
 *
 * Live (USMCA, Devin 2026-08-10): POST /loads/:id/reassign with a nonexistent new_driver_id
 * returned 500 {"code":"23503",…loads_assigned_primary_driver_id_fkey}. Root: assertDriverQualifiedForLoad
 * returns null when the driver row is missing, so UPDATE ran blind. FE also hardcoded the error toast.
 *
 *   node scripts/verify-load-reassign-driver-exists.mjs
 *   node scripts/verify-load-reassign-driver-exists.mjs --selftest
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LABEL = "verify-load-reassign-driver-exists";
const SERVICE = "apps/backend/src/dispatch/dispatch-refinements.service.ts";
const ROUTES = "apps/backend/src/dispatch/dispatch-refinements.routes.ts";
const FE = "apps/frontend/src/pages/dispatch/LoadReassignModal.tsx";

export function auditService(src) {
  const problems = [];
  if (!/E_DRIVER_NOT_FOUND/.test(src)) {
    problems.push(`${SERVICE}: must throw E_DRIVER_NOT_FOUND when mdata.drivers row is missing`);
  }
  if (!/FROM mdata\.drivers d[\s\S]{0,200}?d\.operating_company_id = \$2/.test(src)) {
    problems.push(`${SERVICE}: must entity-scope SELECT mdata.drivers before UPDATE assigned_primary_driver_id`);
  }
  return problems;
}

export function auditRoutes(src) {
  const problems = [];
  if (!/E_DRIVER_NOT_FOUND[\s\S]{0,200}?message:/.test(src)) {
    problems.push(`${ROUTES}: reassign catch must map E_DRIVER_NOT_FOUND → 404 with human message`);
  }
  return problems;
}

export function auditFe(src) {
  const problems = [];
  if (!/userFacingApiError/.test(src)) {
    problems.push(`${FE}: must surface API error via userFacingApiError (not a hardcoded permissions toast only)`);
  }
  if (/Could not reassign\. Check permissions and try again\.<\/div>/.test(src)) {
    problems.push(`${FE}: still hardcodes reassign failure copy with no API message`);
  }
  // Accept either fallback string as long as userFacingApiError wraps mut.error
  if (!/userFacingApiError\(\s*mut\.error/.test(src)) {
    problems.push(`${FE}: userFacingApiError must wrap mut.error`);
  }
  return problems;
}

function selftest() {
  const failures = [];
  const goodSvc = `
    FROM mdata.drivers d
    WHERE d.id = $1::uuid
      AND d.operating_company_id = $2::uuid
    if (!driverExists.rows[0]) throw new Error("E_DRIVER_NOT_FOUND");
  `;
  if (auditService(goodSvc).length) failures.push(`svc good: ${auditService(goodSvc)}`);
  if (!auditService("UPDATE mdata.loads").some((p) => p.includes("E_DRIVER_NOT_FOUND"))) {
    failures.push("svc bad not detected");
  }
  const goodRt = `if (msg === "E_DRIVER_NOT_FOUND") { return reply.code(404).send({ error: "E_DRIVER_NOT_FOUND", message: "Selected driver was not found for this operating company." }); }`;
  if (auditRoutes(goodRt).length) failures.push(`routes good: ${auditRoutes(goodRt)}`);
  const goodFe = `userFacingApiError(mut.error, "Could not reassign. Check permissions and try again.")`;
  if (auditFe(goodFe).length) failures.push(`fe good: ${auditFe(goodFe)}`);
  const badFe = `<div className="text-xs text-red-600">Could not reassign. Check permissions and try again.</div>`;
  if (!auditFe(badFe).some((p) => p.includes("hardcodes"))) failures.push("fe hardcode not detected");

  const real = [
    ...auditService(readFileSync(join(ROOT, SERVICE), "utf8")),
    ...auditRoutes(readFileSync(join(ROOT, ROUTES), "utf8")),
    ...auditFe(readFileSync(join(ROOT, FE), "utf8")),
  ];
  if (real.length) failures.push(`real: ${real.join(" | ")}`);
  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = [
    ...auditService(readFileSync(join(ROOT, SERVICE), "utf8")),
    ...auditRoutes(readFileSync(join(ROOT, ROUTES), "utf8")),
    ...auditFe(readFileSync(join(ROOT, FE), "utf8")),
  ];
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — reassign validates driver exists; FE shows API message`);
}

main();
