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
  for (const token of [
    "FROM mdata.driver_company_authorizations reassign_driver_dca",
    "reassign_driver_dca.driver_id = d.id",
    "reassign_driver_dca.company_id = $2::uuid",
    "reassign_driver_dca.is_authorized = true",
    "reassign_driver_dca.deactivated_at IS NULL",
  ]) if (!src.includes(token)) problems.push(`${SERVICE}: missing shared-driver membership ${token}`);
  if (!/const reassignmentUpdate = await client\.query<\{ id: string \}>\([\s\S]{0,450}UPDATE mdata\.loads[\s\S]{0,250}AND operating_company_id = \$3::uuid[\s\S]{0,100}RETURNING id[\s\S]{0,220}input\.operating_company_id[\s\S]{0,160}if \(!reassignmentUpdate\.rows\[0\]\?\.id\) throw new Error\("E_LOAD_NOT_FOUND"\)/.test(src)) {
    problems.push(`${SERVICE}: canonical reassign UPDATE must bind company and prove the load row changed before history/audit`);
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
  if (!/scopeGenerationRef\.current \+= 1[\s\S]{0,240}setDriverId\(""\)[\s\S]{0,240}mut\.reset\(\)/.test(src)) {
    problems.push(`${FE}: load/company/open transition must retire driver selection and mutation state`);
  }
  if (!/mut\.mutate\(\{\s*loadId,\s*operatingCompanyId,\s*driverId,\s*reasonCode,\s*notes,\s*generation: scopeGenerationRef\.current\s*\}\)/.test(src)) {
    problems.push(`${FE}: reassign submit must snapshot load/company/driver/generation`);
  }
  if (!/input\.generation !== scopeGenerationRef\.current \|\| input\.loadId !== loadId \|\| input\.operatingCompanyId !== operatingCompanyId/.test(src)) {
    problems.push(`${FE}: stale reassign completion must not close or refresh a new scope`);
  }
  if (!/const closeIfIdle[\s\S]{0,100}!mut\.isPending/.test(src) || !/<Modal open=\{open\} onClose=\{closeIfIdle\}/.test(src)) {
    problems.push(`${FE}: pending reassign must lock modal dismissal`);
  }
  return problems;
}

function selftest() {
  const failures = [];
  const goodSvc = `
    FROM mdata.drivers d
    WHERE d.id = $1::uuid
      AND d.operating_company_id = $2::uuid
    OR EXISTS (SELECT 1 FROM mdata.driver_company_authorizations reassign_driver_dca
      WHERE reassign_driver_dca.driver_id = d.id
      AND reassign_driver_dca.company_id = $2::uuid
    AND reassign_driver_dca.is_authorized = true
    AND reassign_driver_dca.deactivated_at IS NULL)
    if (!driverExists.rows[0]) throw new Error("E_DRIVER_NOT_FOUND");
    const reassignmentUpdate = await client.query<{ id: string }>(
      "UPDATE mdata.loads SET assigned_primary_driver_id = $2 WHERE id = $1 " +
      "AND operating_company_id = $3::uuid RETURNING id",
      [input.load_id, input.new_driver_id, input.operating_company_id]
    );
    if (!reassignmentUpdate.rows[0]?.id) throw new Error("E_LOAD_NOT_FOUND");
  `;
  if (auditService(goodSvc).length) failures.push(`svc good: ${auditService(goodSvc)}`);
  const sharedMutations = [
    ["source", "FROM mdata.driver_company_authorizations reassign_driver_dca", "FROM mdata.drivers reassign_driver_dca"],
    ["identity", "reassign_driver_dca.driver_id = d.id", "reassign_driver_dca.driver_id IS NULL"],
    ["company", "reassign_driver_dca.company_id = $2::uuid", "reassign_driver_dca.company_id = d.operating_company_id"],
    ["authorization", "reassign_driver_dca.is_authorized = true", "reassign_driver_dca.is_authorized = false"],
    ["deactivation", "reassign_driver_dca.deactivated_at IS NULL", "reassign_driver_dca.deactivated_at IS NOT NULL"],
  ];
  for (const [label, before, after] of sharedMutations) {
    const mutated = goodSvc.replace(before, after);
    if (mutated === goodSvc || auditService(mutated).length === 0) failures.push(`shared ${label} mutation stayed green`);
  }
  const writeMutations = [
    ["write company", "AND operating_company_id = $3::uuid", "AND TRUE"],
    ["write result", "if (!reassignmentUpdate.rows[0]?.id)", "if (false)"],
  ];
  for (const [label, before, after] of writeMutations) {
    const mutated = goodSvc.replace(before, after);
    if (mutated === goodSvc || auditService(mutated).length === 0) failures.push(`${label} mutation stayed green`);
  }
  if (!auditService("UPDATE mdata.loads").some((p) => p.includes("E_DRIVER_NOT_FOUND"))) {
    failures.push("svc bad not detected");
  }
  const goodRt = `if (msg === "E_DRIVER_NOT_FOUND") { return reply.code(404).send({ error: "E_DRIVER_NOT_FOUND", message: "Selected driver was not found for this operating company." }); }`;
  if (auditRoutes(goodRt).length) failures.push(`routes good: ${auditRoutes(goodRt)}`);
  const goodFe = `
    userFacingApiError(mut.error, "Could not reassign. Check permissions and try again.")
    scopeGenerationRef.current += 1; setDriverId(""); setReasonCode(REASSIGN_REASON_CODES[0].value); setNotes(""); setGateBlocked(false); mut.reset();
    mut.mutate({ loadId, operatingCompanyId, driverId, reasonCode, notes, generation: scopeGenerationRef.current });
    if (input.generation !== scopeGenerationRef.current || input.loadId !== loadId || input.operatingCompanyId !== operatingCompanyId) return;
    const closeIfIdle = () => { if (!mut.isPending) onClose(); };
    <Modal open={open} onClose={closeIfIdle} />
  `;
  if (auditFe(goodFe).length) failures.push(`fe good: ${auditFe(goodFe)}`);
  const badFe = `<div className="text-xs text-red-600">Could not reassign. Check permissions and try again.</div>`;
  if (!auditFe(badFe).some((p) => p.includes("hardcodes"))) failures.push("fe hardcode not detected");
  const feMutations = [
    ["reset", "setDriverId(\"\")", "setDriverId(driverId)"],
    ["snapshot", "generation: scopeGenerationRef.current", "generation: 0"],
    ["stale completion", "input.generation !== scopeGenerationRef.current", "false"],
    ["pending dismissal", "<Modal open={open} onClose={closeIfIdle}", "<Modal open={open} onClose={onClose}"],
  ];
  for (const [label, before, after] of feMutations) {
    const mutated = goodFe.replace(before, after);
    if (mutated === goodFe || auditFe(mutated).length === 0) failures.push(`FE ${label} mutation stayed green`);
  }

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
  console.log(`${LABEL}: selftest PASS — ${sharedMutations.length + writeMutations.length}/${sharedMutations.length + writeMutations.length} shared-driver/write mutations rejected`);
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
