#!/usr/bin/env node
/**
 * GUARD: damage reports + trailer interchanges drill through on list AND detail (SAF-C06).
 *
 * WHY THIS EXISTS (2026-07-23 audit — linkage matrix SAF-C06)
 * safety.incidents persisted driver_id / unit_id / trailer_id / load_id on create, but the shared
 * SafetyIncidentsClusterSurface list rendered driver and unit as plain text (names with no link)
 * and the detail drawer showed load_id as a raw uuid. Forward linkage existed in the DB only —
 * operators could not drill to the driver profile, unit profile, load detail, or trailer profile.
 *
 * Fix contract:
 *   - GET /api/v1/safety/incidents list + GET :id detail join driver_name, unit_number,
 *     trailer_number (mdata.equipment), load_number — entity-scoped;
 *   - SafetyIncidentsClusterSurface list Driver/Unit columns use EntityLink with joined labels;
 *   - detail read-only Driver/Unit/Trailer/Load fields use EntityLink (never str(load_id)).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTES = "apps/backend/src/safety/incidents.routes.ts";
const SURFACE = "apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx";
const LABEL = "verify-safety-incidents-cluster-entitylinks";
const SELFTEST = process.argv.includes("--selftest");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^[ \t]*\/\/.*$/gm, "");

function incidentsListHandler(routeSrc) {
  const start = routeSrc.indexOf('app.get("/api/v1/safety/incidents"');
  if (start === -1) return "";
  const rest = routeSrc.slice(start);
  const end = rest.indexOf("return { incidents:");
  return end === -1 ? rest.slice(0, 2000) : rest.slice(0, end + 30);
}

function incidentsDetailHandler(routeSrc) {
  const start = routeSrc.indexOf('app.get("/api/v1/safety/incidents/:id"');
  if (start === -1) return "";
  const rest = routeSrc.slice(start);
  const end = rest.indexOf("return { incident:");
  return end === -1 ? rest.slice(0, 2000) : rest.slice(0, end + 30);
}

export function assertIncidentsClusterEntityLinks(sources) {
  const routes = stripComments(sources?.[ROUTES] ?? read(ROUTES));
  const surface = stripComments(sources?.[SURFACE] ?? read(SURFACE));
  const problems = [];

  for (const [name, handler] of [
    ["list", incidentsListHandler(routes)],
    ["detail", incidentsDetailHandler(routes)],
  ]) {
    if (!handler) {
      problems.push(`${ROUTES}: GET /api/v1/safety/incidents${name === "detail" ? "/:id" : ""} handler not found.`);
      continue;
    }
    if (!/LEFT JOIN mdata\.drivers/.test(handler)) {
      problems.push(`${ROUTES}: incidents ${name} does not join mdata.drivers for driver_name.`);
    }
    if (!/LEFT JOIN mdata\.units/.test(handler)) {
      problems.push(`${ROUTES}: incidents ${name} does not join mdata.units for unit_number.`);
    }
    if (!/LEFT JOIN mdata\.loads/.test(handler) || !/AS load_number/.test(handler)) {
      problems.push(`${ROUTES}: incidents ${name} does not join mdata.loads for load_number.`);
    }
    if (!/LEFT JOIN mdata\.equipment/.test(handler) || !/AS trailer_number/.test(handler)) {
      problems.push(`${ROUTES}: incidents ${name} does not join mdata.equipment for trailer_number.`);
    }
    if (/LEFT JOIN mdata\.units/.test(handler) && !/owner_company_id|currently_leased_to_company_id/.test(handler)) {
      problems.push(`${ROUTES}: incidents ${name} unit join is not owner/lessee scoped.`);
    }
  }

  if (!/import \{ EntityLink \}/.test(surface) && !/EntityLink/.test(surface)) {
    problems.push(`${SURFACE}: EntityLink is not imported — list/detail cannot drill through.`);
  }
  if (!/kind="driver"[\s\S]{0,120}label=/.test(surface)) {
    problems.push(`${SURFACE}: Driver column/detail does not use EntityLink kind="driver" with a name label.`);
  }
  if (!/kind="unit"[\s\S]{0,120}label=/.test(surface)) {
    problems.push(`${SURFACE}: Unit column/detail does not use EntityLink kind="unit" with a label.`);
  }
  if (!/kind="load"[\s\S]{0,120}detail\.load_id/.test(surface)) {
    problems.push(`${SURFACE}: detail Load field does not use EntityLink kind="load" — still a dead-end uuid/text.`);
  }
  if (/str\(detail\?\.load_id\)/.test(surface)) {
    problems.push(`${SURFACE}: detail Load still renders str(detail?.load_id) — raw uuid on screen.`);
  }
  if (!/kind="trailer"/.test(surface)) {
    problems.push(`${SURFACE}: detail Trailer does not use EntityLink kind="trailer".`);
  }

  return problems;
}

if (SELFTEST) {
  const live = { [ROUTES]: read(ROUTES), [SURFACE]: read(SURFACE) };
  const failures = [];
  const expectCaught = (name, mutated, needle) => {
    const problems = assertIncidentsClusterEntityLinks(mutated);
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: NOT caught (expected "${needle}", got: ${problems.join(" | ") || "none"})`);
    }
  };

  expectCaught(
    "list-loses-driver-join",
    { ...live, [ROUTES]: live[ROUTES].replace(/LEFT JOIN mdata\.drivers d[\s\S]*?operating_company_id = i\.operating_company_id\n/g, "") },
    "does not join mdata.drivers"
  );
  expectCaught(
    "surface-reverts-to-plain-driver",
    {
      ...live,
      [SURFACE]: live[SURFACE].replace(
        /<EntityLink[\s\S]*?kind="driver"[\s\S]*?\/>/g,
        '<span>plain driver</span>'
      ),
    },
    'EntityLink kind="driver"'
  );
  expectCaught(
    "load-uuid-text-returns",
    {
      ...live,
      [SURFACE]: live[SURFACE].replace(
        /<EntityLink[\s\S]*?kind="load"[\s\S]*?\/>/g,
        '<span>{str(detail?.load_id)}</span>'
      ),
    },
    "str(detail?.load_id)"
  );

  const liveProblems = assertIncidentsClusterEntityLinks(live);
  if (liveProblems.length) failures.push(`live sources FAIL: ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — planted defects caught, live sources clean`);
  process.exit(0);
}

const problems = assertIncidentsClusterEntityLinks();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — incidents cluster list + detail drill through driver/unit/trailer/load by name`);
