#!/usr/bin/env node
/** @matrix-built {"modules":["safety","operations"],"cols":["reverse_link","connectivity"],"leafRe":"^(geofence_alerts|geofencing)$","task":"LINK-GEOFENCE-ENTITYLINK-DRILL"} */
/**
 * Geofences were undrillable: EntityLink had no "geofence" kind, GeofencesPage never read a
 * ?geofence_id= deep link, and GeofenceBreachesTab rendered the geofence label as dead text.
 *
 * FIX (3 files, one class): EntityLink.tsx gained kind="geofence" -> /dispatch/geofencing?geofence_id=
 * (real, verified route — routes/manifest.tsx path="/dispatch/geofencing"); GeofencesPage.tsx now
 * reads that param (deepLinkGeofenceId effect, same pattern as ClaimsTab/LawsuitsTab) and highlights
 * the row, and its "Label" column is a real EntityLink instead of plain text; GeofenceBreachesTab.tsx
 * renders the breach's geofence as that same EntityLink instead of entityLabel() dead text.
 *
 * This guard asserts all three legs together — fixing only one leg (e.g. adding the EntityKind but
 * never consuming the query param) is exactly the kind of half-fix REMAINING would otherwise hide.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-geofence-entitylink-drill";

const ENTITY_LINK_FILE = "apps/frontend/src/components/shared/EntityLink.tsx";
const GEOFENCES_PAGE_FILE = "apps/frontend/src/pages/operations/GeofencesPage.tsx";
const BREACHES_TAB_FILE = "apps/frontend/src/pages/safety/tabs/GeofenceBreachesTab.tsx";

export function auditEntityLinkSource(source) {
  const problems = [];
  if (!/\|\s*"geofence"/.test(source)) {
    problems.push(`${ENTITY_LINK_FILE}: EntityKind union no longer declares "geofence"`);
  }
  if (!/case\s+"geofence"\s*:\s*\n\s*return\s+`\/dispatch\/geofencing\?geofence_id=\$\{id\}`/.test(source)) {
    problems.push(`${ENTITY_LINK_FILE}: resolveEntityRoute no longer resolves "geofence" to /dispatch/geofencing?geofence_id=`);
  }
  return problems;
}

export function auditGeofencesPageSource(source) {
  const problems = [];
  if (!/searchParams\.get\(\s*"geofence_id"\s*\)/.test(source)) {
    problems.push(`${GEOFENCES_PAGE_FILE}: no longer reads ?geofence_id= from the URL — deep link into this page is dead`);
  }
  if (!/kind="geofence"/.test(source)) {
    problems.push(`${GEOFENCES_PAGE_FILE}: Label column no longer renders EntityLink kind="geofence" — self-referential drill lost`);
  }
  if (!/rowClassName/.test(source)) {
    problems.push(`${GEOFENCES_PAGE_FILE}: no row highlight wired to the deep-linked geofence — landing here from a reverse link shows nothing selected`);
  }
  return problems;
}

export function auditBreachesTabSource(source) {
  const problems = [];
  if (!/kind="geofence"/.test(source)) {
    problems.push(`${BREACHES_TAB_FILE}: geofence label no longer renders EntityLink kind="geofence" — reverted to dead text`);
  }
  if (!/id=\{event\.geofence_id\}/.test(source)) {
    problems.push(`${BREACHES_TAB_FILE}: geofence EntityLink must pass id={event.geofence_id} — the real canonical id`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const goodEntityLink = 'export type EntityKind =\n  | "user"\n  | "geofence";\nexport function resolveEntityRoute(kind, id) {\n  switch (kind) {\n    case "user":\n      return `/users/${id}`;\n    case "geofence":\n      return `/dispatch/geofencing?geofence_id=${id}`;\n    default:\n      return null;\n  }\n}';
  if (auditEntityLinkSource(goodEntityLink).length) {
    console.error(`${LABEL} SELFTEST FAIL — real EntityLink geofence support rejected`);
    process.exit(1);
  }
  const mutatedEntityLink = goodEntityLink.replace('| "geofence";', ';').replace(/case "geofence":\n\s*return `\/dispatch\/geofencing\?geofence_id=\$\{id\}`;\n/, "");
  if (!auditEntityLinkSource(mutatedEntityLink).length) {
    console.error(`${LABEL} SELFTEST FAIL — removed EntityKind/route mutation escaped`);
    process.exit(1);
  }

  const goodPage = 'const deepLinkGeofenceId = searchParams.get("geofence_id");\n<EntityLink kind="geofence" id={item.id} label={item.label} />\n<ParityTable rowClassName={(item) => ""} />';
  if (auditGeofencesPageSource(goodPage).length) {
    console.error(`${LABEL} SELFTEST FAIL — real GeofencesPage wiring rejected`);
    process.exit(1);
  }
  const mutatedPage = 'const geofences = data;\n{item.label}\n<ParityTable />';
  if (!auditGeofencesPageSource(mutatedPage).length) {
    console.error(`${LABEL} SELFTEST FAIL — GeofencesPage regression escaped`);
    process.exit(1);
  }

  const goodTab = '<EntityLink kind="geofence" id={event.geofence_id} label={entityLabel(event.geofence_label, event.geofence_id, "Geofence")} />';
  if (auditBreachesTabSource(goodTab).length) {
    console.error(`${LABEL} SELFTEST FAIL — real BreachesTab wiring rejected`);
    process.exit(1);
  }
  const mutatedTab = '{entityLabel(event.geofence_label, event.geofence_id, "Geofence")}';
  if (!auditBreachesTabSource(mutatedTab).length) {
    console.error(`${LABEL} SELFTEST FAIL — BreachesTab regression to dead text escaped`);
    process.exit(1);
  }

  console.log(`${LABEL} SELFTEST PASS — all three legs' mutations rejected`);
  process.exit(0);
}

const failures = [
  ...auditEntityLinkSource(fs.readFileSync(path.join(ROOT, ENTITY_LINK_FILE), "utf8")),
  ...auditGeofencesPageSource(fs.readFileSync(path.join(ROOT, GEOFENCES_PAGE_FILE), "utf8")),
  ...auditBreachesTabSource(fs.readFileSync(path.join(ROOT, BREACHES_TAB_FILE), "utf8")),
];
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — geofence EntityLink, deep-link consumption, and breach drill-through all wired`);
