#!/usr/bin/env node
/** @matrix-built {"modules":["safety"],"cols":["driver","unit","trailer","load","connectivity","qbo_chrome"],"leaves":["damage_reports.create","trailer_interchanges.create"],"task":"SAFETY-F6620-INCIDENT-CONFIRM-LIFECYCLE","vertical":"column-wave"} */
/**
 * GUARD: damage reports, trailer interchanges and cargo claims can be edited and closed (SAF-F20).
 *
 * WHY THIS EXISTS (2026-07-23 audit)
 * These three surfaces were CREATE-ONLY. `saveCreate` returned early unless `createMode`, every
 * input carried `disabled={!createMode}`, and there was no edit, no status change, no close and no
 * void anywhere. So an incident filed with the wrong amount, the wrong unit or the wrong description
 * could never be corrected, and one filed in error stayed "open" forever — while
 * safety.incidents.status has accepted open | investigating | closed since migration 0345 and
 * nothing in the product could ever set it past the default.
 *
 * Pinned here because each is a way to quietly undo the fix:
 *   - incident_type must NOT be patchable: it decides which surface and which regulatory shape owns
 *     the record (a damage report is not a cargo claim), so patching it would silently move a record
 *     between modules.
 *   - the PATCH must use an explicit column allow-list, never a spread of the parsed body — on a
 *     table carrying damage_amount_cents, a future schema addition must not reach the UPDATE
 *     unreviewed.
 *   - a status change is reason-REQUIRED. A $4,000 damage report closed with no recorded reason has
 *     no answer to "why?" when an insurer or auditor asks months later.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTES = "apps/backend/src/safety/incidents.routes.ts";
const SURFACE = "apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx";
const API = "apps/frontend/src/api/safety.ts";
const FILES = [ROUTES, SURFACE, API];
const LABEL = "verify-incident-lifecycle";
const SELFTEST = process.argv.includes("--selftest");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^[ \t]*\/\/.*$/gm, "");

export function assertIncidentLifecycle(sources) {
  const src = {};
  for (const rel of FILES) src[rel] = stripComments(sources?.[rel] ?? read(rel));
  const problems = [];

  if (!/app\.patch\(\s*"\/api\/v1\/safety\/incidents\/:id"/.test(src[ROUTES])) {
    problems.push(`${ROUTES}: no PATCH route — an incident filed with a wrong amount or unit could never be corrected.`);
  }
  if (!/app\.post\(\s*"\/api\/v1\/safety\/incidents\/:id\/status"/.test(src[ROUTES])) {
    problems.push(`${ROUTES}: no status route — safety.incidents.status has accepted open/investigating/closed since 0345 and nothing could set it.`);
  }
  if (!/const PATCHABLE = \[/.test(src[ROUTES])) {
    problems.push(`${ROUTES}: the PATCH does not use an explicit column allow-list — a body spread lets future schema additions reach the UPDATE unreviewed.`);
  }
  if (/"incident_type"/.test(src[ROUTES].slice(src[ROUTES].indexOf("const PATCHABLE = ["), src[ROUTES].indexOf("] as const")))) {
    problems.push(`${ROUTES}: incident_type is patchable — changing it silently moves a record between surfaces and regulatory shapes.`);
  }
  if (!/(?<!void_)reason: z\.string\(\)\.trim\(\)\.min\(3\)/.test(src[ROUTES])) {
    problems.push(`${ROUTES}: the status change is not reason-required — a closed incident with no recorded reason cannot answer "why?" to an insurer or auditor.`);
  }
  for (const event of ["safety.incident.updated", "safety.incident.status_changed", "safety.incident.voided"]) {
    const start = src[ROUTES].indexOf(`"${event}"`);
    const audit = start < 0 ? "" : src[ROUTES].slice(start, start + 650);
    if (!/operating_company_id:\s*query\.data\.operating_company_id/.test(audit)) {
      problems.push(`${ROUTES}: ${event} audit must carry the canonical submitted company.`);
    }
  }

  for (const fn of ["updateSafetyIncident", "setSafetyIncidentStatus"]) {
    if (!src[API].includes(`export function ${fn}`)) {
      problems.push(`${API}: no ${fn} client — the route is unreachable from the UI.`);
    }
    if (!src[SURFACE].includes(fn)) {
      problems.push(`${SURFACE}: does not call ${fn} — the surface stays create-only, which is the original defect.`);
    }
  }
  if (!/const formEditable = createMode \|\| editMode;/.test(src[SURFACE])) {
    problems.push(`${SURFACE}: fields are not gated on an editable flag — with disabled={!createMode} an existing incident is permanently read-only.`);
  }
  if (/disabled=\{!createMode\}/.test(src[SURFACE])) {
    problems.push(`${SURFACE}: still has disabled={!createMode} on a field — that field cannot be edited after creation.`);
  }
  if (!/-status-reason/.test(src[SURFACE])) {
    problems.push(`${SURFACE}: the status control collects no reason — the server requires one, so the UI would only ever produce a 400.`);
  }
  for (const [action, fallback] of [
    ["create", "Could not create the safety incident"],
    ["save", "Could not save the safety incident"],
    ["upload", "Could not upload the incident photo"],
  ]) {
    if (!new RegExp(`userFacingApiError\\(err,\\s*["']${fallback}["']\\)`).test(src[SURFACE])) {
      problems.push(`${SURFACE}: ${action} rejection must preserve backend detail.`);
    }
  }
  if (!/actionError\s*\?[\s\S]{0,140}?role=["']alert["']/.test(src[SURFACE])) {
    problems.push(`${SURFACE}: incident create/edit/photo failures need one accessible operator alert.`);
  }
  if (/window\.confirm\(/.test(src[SURFACE])) problems.push(`${SURFACE}: native confirmation still blocks trailer-interchange create.`);
  if (!/pendingPhotoLessCreate, setPendingPhotoLessCreate/.test(src[SURFACE])) problems.push(`${SURFACE}: photo-less create does not retain an immutable submitted snapshot.`);
  if (!/operating_company_id: operatingCompanyId[\s\S]*driver_id: str\(selected\.driver_id\) \|\| null[\s\S]*unit_id: str\(selected\.unit_id\) \|\| null[\s\S]*trailer_id: str\(selected\.trailer_id\) \|\| null[\s\S]*load_id: str\(selected\.load_id\) \|\| null/.test(src[SURFACE])) problems.push(`${SURFACE}: create snapshot is missing company or canonical FKs.`);
  if (!/companyId: operatingCompanyId[\s\S]*generation: createGenerationRef\.current[\s\S]*payload,/.test(src[SURFACE])) problems.push(`${SURFACE}: submitted payload is not bound to company and generation.`);
  if (!/input\.generation !== createGenerationRef\.current[\s\S]*refresh\(input\.companyId\)/.test(src[SURFACE])) problems.push(`${SURFACE}: create completion is not generation-safe or submitted-company scoped.`);
  if (!/createGenerationRef\.current \+= 1;[\s\S]*setPendingPhotoLessCreate\(null\);[\s\S]*setDrawerOpen\(false\);/.test(src[SURFACE])) problems.push(`${SURFACE}: company switch does not invalidate pending create and drawer state.`);
  if (!/<ConfirmModal[\s\S]*title="Create interchange without condition photos\?"[\s\S]*const input = pendingPhotoLessCreate;[\s\S]*await persistCreate\(input\)/.test(src[SURFACE]) || /const input = pendingPhotoLessCreate;[\s\S]{0,120}setPendingPhotoLessCreate\(null\)/.test(src[SURFACE])) problems.push(`${SURFACE}: trailer-interchange exception must await success without discarding its retry snapshot.`);

  return problems;
}

if (SELFTEST) {
  const live = Object.fromEntries(FILES.map((rel) => [rel, read(rel)]));
  const failures = [];
  const expectCaught = (name, mutated, needle) => {
    if (JSON.stringify(mutated) === JSON.stringify(live)) {
      failures.push(`${name}: inert mutation — the guard was never actually exercised`);
      return;
    }
    const problems = assertIncidentLifecycle(mutated);
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: NOT caught (expected "${needle}", got: ${problems.join(" | ") || "none"})`);
    }
  };

  expectCaught("patch-route-removed",
    { ...live, [ROUTES]: live[ROUTES].split('app.patch("/api/v1/safety/incidents/:id"').join('app.patch("/api/v1/safety/incidents/:id/other"') },
    "no PATCH route");
  expectCaught("status-route-removed",
    { ...live, [ROUTES]: live[ROUTES].split('/api/v1/safety/incidents/:id/status').join('/api/v1/safety/incidents/:id/nope') },
    "no status route");
  expectCaught("allowlist-replaced-by-spread",
    { ...live, [ROUTES]: live[ROUTES].replace("const PATCHABLE = [", "const NOT_AN_ALLOWLIST = [") },
    "explicit column allow-list");
  expectCaught("incident-type-becomes-patchable",
    { ...live, [ROUTES]: live[ROUTES].replace('const PATCHABLE = [\n      "incident_at",', 'const PATCHABLE = [\n      "incident_type",\n      "incident_at",') },
    "incident_type is patchable");
  expectCaught("status-reason-made-optional",
    {
      ...live,
      [ROUTES]: live[ROUTES].replace(
        /const statusBodySchema = z\.object\(\{\s*status: z\.enum\(\["open", "investigating", "closed"\]\),\s*reason: z\.string\(\)\.trim\(\)\.min\(3\)\.max\(500\),\s*\}\)/,
        `const statusBodySchema = z.object({
  status: z.enum(["open", "investigating", "closed"]),
  reason: z.string().optional(),
})`,
      ),
    },
    "not reason-required");
  for (const event of ["safety.incident.updated", "safety.incident.status_changed", "safety.incident.voided"]) {
    const eventIndex = live[ROUTES].indexOf(`"${event}"`);
    const companyToken = "operating_company_id: query.data.operating_company_id";
    const companyIndex = live[ROUTES].indexOf(companyToken, eventIndex);
    const mutatedRoute =
      live[ROUTES].slice(0, companyIndex) +
      "operating_company_id: missingCompany" +
      live[ROUTES].slice(companyIndex + companyToken.length);
    expectCaught(`${event}-company-dropped`, { ...live, [ROUTES]: mutatedRoute }, `${event} audit must carry`);
  }
  expectCaught("fields-locked-again",
    { ...live, [SURFACE]: live[SURFACE].replace("const formEditable = createMode || editMode;", "const formEditable = createMode;") },
    "not gated on an editable flag");
  expectCaught("surface-stops-calling-update",
    { ...live, [SURFACE]: live[SURFACE].split("updateSafetyIncident").join("somethingElse") },
    "does not call updateSafetyIncident");
  for (const [name, needle, replacement] of [
    ["create-error-hidden", "Could not create the safety incident", "Create failed"],
    ["edit-error-hidden", "Could not save the safety incident", "Save failed"],
    ["photo-error-hidden", "Could not upload the incident photo", "Upload failed"],
    ["action-alert-demoted", 'role="alert"', 'role="status"'],
  ]) {
    expectCaught(name, { ...live, [SURFACE]: live[SURFACE].replace(needle, replacement) }, name.includes("alert") ? "accessible operator alert" : "preserve backend detail");
  }
  for (const [name, needle, replacement, expected] of [
    ["snapshot-dropped", "companyId: operatingCompanyId,", "companyId: '',", "submitted payload is not bound"],
    ["stale-create-gate-dropped", "input.generation !== createGenerationRef.current", "false", "create completion is not generation-safe"],
    ["scope-invalidation-dropped", "createGenerationRef.current += 1;", "createGenerationRef.current += 0;", "company switch does not invalidate"],
    ["confirm-modal-dropped", "<ConfirmModal", "<div", "must await success"],
    ["pending-snapshot-dropped", "pendingPhotoLessCreate, setPendingPhotoLessCreate", "missingPending, setMissingPending", "does not retain an immutable"],
    ["confirm-retry-dropped", "const input = pendingPhotoLessCreate;\n          await persistCreate(input);", "const input = pendingPhotoLessCreate;\n          setPendingPhotoLessCreate(null);\n          await persistCreate(input);", "must await success"],
  ]) {
    expectCaught(name, { ...live, [SURFACE]: live[SURFACE].replace(needle, replacement) }, expected);
  }

  const liveProblems = assertIncidentLifecycle(live);
  if (liveProblems.length) failures.push(`live sources FAIL (false positive): ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 20 planted defects caught, live sources clean`);
  process.exit(0);
}

const problems = assertIncidentLifecycle();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — incidents can be edited (allow-listed columns, type immutable) and their status changed with a required reason`);
