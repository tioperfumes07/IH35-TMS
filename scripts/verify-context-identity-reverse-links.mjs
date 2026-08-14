#!/usr/bin/env node
/** @matrix-built {"modules":["fleet","system","reports"],"cols":["customer","driver","vendor","unit","load","connectivity","reverse_link"],"leafRe":"^(unit\\.profile\\.identity|audit\\.trail|report\\.geofence_reconciliation)$","task":"LINK-F5138-CONTEXT-IDENTITY-REVERSE-LINKS","vertical":"class-sweep"} */
import fs from "node:fs";
import process from "node:process";

const FILES = {
  unit: "apps/frontend/src/components/vehicle-profile/IdentityStatusHeader.tsx",
  audit: "apps/frontend/src/pages/audit/AuditTrailPage.tsx",
  recon: "apps/frontend/src/pages/reports/GeofenceReconciliationReport.tsx",
  systemMatrix: "docs/specs/scoreboard/modules/system.required.json",
};
const read = () => Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
function verify(source) {
  const failures = [];
  const need = (key, text, message) => { if (!source[key].includes(text)) failures.push(message); };
  need("unit", '<EntityLink kind="unit" id={unitId}', "vehicle profile heading must drill through by canonical unit id");
  need("audit", 'const SUBJECT_ENTITY_KINDS: Readonly<Record<string, EntityKind>>', "audit subjects must use an explicit canonical kind map");
  for (const [subject, kind] of [["load", "load"], ["driver", "driver"], ["unit", "unit"], ["customer", "customer"], ["vendor", "vendor"], ["work_order", "work_order"]]) {
    need("audit", `${subject}: "${kind}"`, `audit subject map must cover ${subject}`);
  }
  need("audit", '<EntityLink kind={kind} id={row.subject_id}', "mapped audit subjects must drill through by canonical subject id");
  need("recon", '<EntityLink kind="geofence" id={f.geofence_id ?? undefined}', "reconciliation geofence must drill through to the canonical geofence surface");
  let matrix;
  try { matrix = JSON.parse(source.systemMatrix); } catch (error) { failures.push(`system matrix must parse: ${error.message}`); }
  const leaf = matrix?.leaves?.find((candidate) => candidate.id === "audit.trail");
  if (!leaf?.required?.includes("reverse_link")) failures.push("system audit.trail must inventory reverse_link");
  if (leaf?.route_hint !== "/audit/trail") failures.push("system audit.trail must name the mounted route");
  return failures;
}
const source = read();
const failures = verify(source);
if (failures.length) { console.error("context identity reverse-link guard failed:"); failures.forEach((failure) => console.error(`- ${failure}`)); process.exit(1); }
if (process.argv.includes("--self-test")) {
  const mutations = [
    ["unit", '<EntityLink kind="unit" id={unitId}', '<span data-id={unitId}'],
    ["audit", 'const SUBJECT_ENTITY_KINDS: Readonly<Record<string, EntityKind>>', 'const SUBJECT_ENTITY_KINDS = {} as Record<string, EntityKind> //'],
    ["audit", 'load: "load"', 'load: "driver"'],
    ["audit", 'driver: "driver"', 'driver: "unit"'],
    ["audit", 'customer: "customer"', 'customer: "vendor"'],
    ["audit", '<EntityLink kind={kind} id={row.subject_id}', '<span data-id={row.subject_id}'],
    ["recon", '<EntityLink kind="geofence" id={f.geofence_id ?? undefined}', '<span data-id={f.geofence_id ?? undefined}'],
    ["systemMatrix", '"id": "audit.trail"', '"id": "audit.trail.broken"'],
  ];
  for (const [key, before, after] of mutations) {
    if (!source[key].includes(before)) throw new Error(`self-test fixture missing: ${key}`);
    if (!verify({ ...source, [key]: source[key].replaceAll(before, after) }).length) throw new Error(`self-test mutation survived: ${key}`);
  }
  console.log(`PASS: ${mutations.length} planted defects were rejected`);
}
console.log("PASS: contextual record identities drill through across Fleet, System Audit, and Reports");
