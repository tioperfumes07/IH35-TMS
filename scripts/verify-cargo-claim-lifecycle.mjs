#!/usr/bin/env node
/** @matrix-built {"modules":["safety"],"cols":["customer","driver","unit","trailer","load","connectivity","qbo_chrome"],"leaves":["cargo_claims.create"],"task":"SAFETY-F6619-CARGO-UNLINKED-CONFIRM-LIFECYCLE","vertical":"column-wave"} */
/**
 * GUARD: cargo claims can be edited, status-changed, and voided (SAF-F20 cargo-claim leg).
 *
 * WHY THIS EXISTS (2026-08-02 audit)
 * Damage reports and trailer interchanges gained lifecycle controls via SafetyIncidentsClusterSurface
 * (SAF-F20 / SAF-INC-LIFECYCLE), but CargoClaimIntakeSurface stayed create-only: the detail panel was
 * five read-only lines with photo upload. A Carmack claim filed with the wrong amount, customer, or
 * load could never be corrected; one filed in error could be closed only by direct API access.
 *
 * Cargo claims ARE safety.incidents rows (incident_type=cargo_claim) — the shared PATCH /status /void
 * routes already applied; only the UI was missing.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SURFACE = "apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx";
const API = "apps/frontend/src/api/safety.ts";
const FILES = [SURFACE, API];
const LABEL = "verify-cargo-claim-lifecycle";
const SELFTEST = process.argv.includes("--selftest");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

export function assertCargoClaimLifecycle(sources) {
  const src = {};
  for (const rel of FILES) src[rel] = stripComments(sources?.[rel] ?? read(rel));
  const problems = [];

  for (const fn of ["updateSafetyIncident", "setSafetyIncidentStatus", "voidSafetyIncident"]) {
    if (!src[API].includes(`export function ${fn}`)) {
      problems.push(`${API}: no ${fn} client — cargo-claim lifecycle routes are unreachable.`);
    }
    if (!src[SURFACE].includes(fn)) {
      problems.push(`${SURFACE}: does not call ${fn} — the detail panel stays create-only.`);
    }
  }

  if (!/const \[editMode, setEditMode\]/.test(src[SURFACE])) {
    problems.push(`${SURFACE}: no editMode — existing cargo claims cannot be corrected after filing.`);
  }
  if (!/data-testid=\{`\$\{pageTestId\}-edit-btn`\}/.test(src[SURFACE])) {
    problems.push(`${SURFACE}: no Edit control — operators cannot reach the PATCH path.`);
  }
  if (!/data-testid=\{`\$\{pageTestId\}-save-edit-btn`\}/.test(src[SURFACE])) {
    problems.push(`${SURFACE}: no Save changes — edits never persist.`);
  }
  if (!/updateSafetyIncident\(\s*selectedId/.test(src[SURFACE])) {
    problems.push(`${SURFACE}: saveEdit must call updateSafetyIncident with the selected claim id.`);
  }

  if (!/data-testid=\{`\$\{pageTestId\}-lifecycle`\}/.test(src[SURFACE])) {
    problems.push(`${SURFACE}: no lifecycle block — status transitions are unreachable.`);
  }
  if (!/data-testid=\{`\$\{pageTestId\}-status-reason`\}/.test(src[SURFACE])) {
    problems.push(`${SURFACE}: status change collects no reason — the server requires one (min 3).`);
  }
  if (!/setSafetyIncidentStatus\(/.test(src[SURFACE])) {
    problems.push(`${SURFACE}: status buttons do not call setSafetyIncidentStatus.`);
  }

  if (!/data-testid=\{`\$\{pageTestId\}-void-reason`\}/.test(src[SURFACE])) {
    problems.push(`${SURFACE}: void collects no reason — void-cancel governance requires it.`);
  }
  if (!/voidSafetyIncident\(/.test(src[SURFACE])) {
    problems.push(`${SURFACE}: void control does not call voidSafetyIncident.`);
  }
  if (!/user\?\.role === "Owner" \|\| user\?\.role === "Administrator"/.test(src[SURFACE])) {
    problems.push(`${SURFACE}: void is not gated to Owner/Administrator — must mirror incidents.routes.ts.`);
  }
  if (/window\.confirm\(/.test(src[SURFACE])) problems.push(`${SURFACE}: native confirmation blocks the cargo-claim creator.`);
  if (!/pendingUnlinkedCreate, setPendingUnlinkedCreate/.test(src[SURFACE])) problems.push(`${SURFACE}: unlinked confirmation does not retain a submitted snapshot.`);
  if (!/companyId: operatingCompanyId[\s\S]*generation: createGenerationRef\.current[\s\S]*operating_company_id: operatingCompanyId[\s\S]*load_id: form\.loadId \|\| null[\s\S]*claimant_customer_id: form\.claimantCustomerId \|\| null[\s\S]*driver_id: form\.driverId \|\| null[\s\S]*unit_id: form\.unitId \|\| null[\s\S]*trailer_id: form\.trailerId \|\| null/.test(src[SURFACE])) problems.push(`${SURFACE}: create snapshot is missing company or canonical FKs.`);
  if (!/input\.generation !== createGenerationRef\.current[\s\S]*refresh\(input\.companyId\)/.test(src[SURFACE])) problems.push(`${SURFACE}: create completion is not generation-safe or submitted-company scoped.`);
  if (!/<ConfirmModal[\s\S]*title="Create claim without a shipment\?"[\s\S]*const input = pendingUnlinkedCreate;[\s\S]*await persistCreate\(input\)/.test(src[SURFACE]) || /const input = pendingUnlinkedCreate;[\s\S]{0,120}setPendingUnlinkedCreate\(null\)/.test(src[SURFACE])) problems.push(`${SURFACE}: exceptional unlinked create must await success without discarding its retry snapshot.`);

  return problems;
}

if (SELFTEST) {
  const live = Object.fromEntries(FILES.map((rel) => [rel, read(rel)]));
  const failures = [];
  const expectCaught = (name, mutated, needle) => {
    if (JSON.stringify(mutated) === JSON.stringify(live)) {
      failures.push(`${name}: inert mutation`);
      return;
    }
    const problems = assertCargoClaimLifecycle(mutated);
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: NOT caught (expected "${needle}", got: ${problems.join(" | ") || "none"})`);
    }
  };

  expectCaught(
    "edit-btn-removed",
    { ...live, [SURFACE]: live[SURFACE].replace(/data-testid=\{`\$\{pageTestId\}-edit-btn`\}/g, 'data-testid="gone"') },
    "no Edit control"
  );
  expectCaught(
    "create-snapshot-dropped",
    { ...live, [SURFACE]: live[SURFACE].replace("companyId: operatingCompanyId,", "companyId: '',") },
    "create snapshot is missing"
  );
  expectCaught(
    "stale-create-gate-dropped",
    { ...live, [SURFACE]: live[SURFACE].replace("input.generation !== createGenerationRef.current", "false") },
    "create completion is not generation-safe"
  );
  expectCaught(
    "confirm-modal-dropped",
    { ...live, [SURFACE]: live[SURFACE].replace("<ConfirmModal", "<div") },
    "must await success"
  );
  expectCaught(
    "confirm-snapshot-cleanup-dropped",
    { ...live, [SURFACE]: live[SURFACE].replace("const input = pendingUnlinkedCreate;\n          await persistCreate(input);", "const input = pendingUnlinkedCreate;\n          setPendingUnlinkedCreate(null);\n          await persistCreate(input);") },
    "must await success"
  );
  expectCaught(
    "pending-snapshot-dropped",
    { ...live, [SURFACE]: live[SURFACE].replace("pendingUnlinkedCreate, setPendingUnlinkedCreate", "missingPending, setMissingPending") },
    "does not retain a submitted snapshot"
  );
  expectCaught(
    "update-client-dropped",
    { ...live, [SURFACE]: live[SURFACE].replace(/updateSafetyIncident/g, "patchSomethingElse") },
    "does not call updateSafetyIncident"
  );
  expectCaught(
    "status-reason-removed",
    { ...live, [SURFACE]: live[SURFACE].replace(/status-reason/g, "status-note") },
    "status change collects no reason"
  );
  expectCaught(
    "void-client-dropped",
    { ...live, [SURFACE]: live[SURFACE].replace(/voidSafetyIncident/g, "retractClaim") },
    "does not call voidSafetyIncident"
  );
  expectCaught(
    "lifecycle-block-removed",
    { ...live, [SURFACE]: live[SURFACE].replace(/-lifecycle`/g, "-nolifecycle`") },
    "no lifecycle block"
  );

  const liveProblems = assertCargoClaimLifecycle(live);
  if (liveProblems.length) failures.push(`live sources FAIL: ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 10 planted defects caught, live sources clean`);
  process.exit(0);
}

const problems = assertCargoClaimLifecycle();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — cargo claims can be edited, status-changed (reason-required), and voided (Owner/Admin)`);
