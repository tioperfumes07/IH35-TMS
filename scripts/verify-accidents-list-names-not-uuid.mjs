#!/usr/bin/env node
/**
 * GUARD: the accidents list shows driver/unit NAMES, never raw uuids, and does not swallow errors (SAF-F26).
 *
 * WHY THIS EXISTS (2026-07-23 audit)
 * GET /api/v1/safety/accidents did `SELECT * FROM safety.accident_reports` inside a
 * `.catch(() => ({ rows: [] }))` swallow, so it returned no driver/unit names and rendered as an empty
 * "no accidents" all-clear if the query failed. AccidentsPage's EntityLink columns had no label (so
 * they showed the raw uuid) and the driver/unit filters matched only the raw uuid — unusable.
 *
 * Fix contract:
 *   - backend joins mdata.drivers (entity-scoped) + mdata.units (owner/lessee — units have NO
 *     operating_company_id) and returns driver_name + unit_number, with NO catch-swallow;
 *   - AccidentsPage passes those names as the EntityLink label and filters on them.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTE = "apps/backend/src/safety/safety.routes.ts";
const PAGE = "apps/frontend/src/pages/safety/AccidentsPage.tsx";
const LABEL = "verify-accidents-list-names-not-uuid";
const SELFTEST = process.argv.includes("--selftest");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/** The GET /api/v1/safety/accidents list handler body. */
function accidentsListHandler(routeSrc) {
  const match = routeSrc.match(/app\.get\s*\(\s*["']\/api\/v1\/safety\/accidents["']/);
  if (!match) return "";
  const start = match.index;
  const rest = routeSrc.slice(start);
  const end = rest.indexOf("return { accidents:");
  return end === -1 ? rest.slice(0, 2500) : rest.slice(0, end + 40);
}

export function assertAccidentsNames(sources) {
  const route = stripComments(sources?.[ROUTE] ?? read(ROUTE));
  const page = stripComments(sources?.[PAGE] ?? read(PAGE));
  const problems = [];

  const handler = accidentsListHandler(route);
  if (!handler) {
    problems.push(`${ROUTE}: the GET /api/v1/safety/accidents handler was not found.`);
    return problems;
  }

  if (!/LEFT JOIN mdata\.drivers/.test(handler)) {
    problems.push(`${ROUTE}: accidents list does not LEFT JOIN mdata.drivers — no driver name to show.`);
  }
  if (!/LEFT JOIN mdata\.units/.test(handler)) {
    problems.push(`${ROUTE}: accidents list does not LEFT JOIN mdata.units — no unit number to show.`);
  }
  // The unit join must be owner/lessee scoped (units have NO operating_company_id).
  if (/LEFT JOIN mdata\.units/.test(handler) && !/owner_company_id|currently_leased_to_company_id/.test(handler)) {
    problems.push(`${ROUTE}: the mdata.units join is not scoped by owner_company_id/currently_leased_to_company_id (units have no operating_company_id).`);
  }
  if (!/AS driver_name/.test(handler) || !/AS unit_number/.test(handler)) {
    problems.push(`${ROUTE}: accidents list does not expose driver_name + unit_number.`);
  }
  // No error-swallow on the accidents list — a failure must surface, not render empty.
  if (/SELECT \* FROM safety\.accident_reports/.test(handler) || /\.catch\(\(\)\s*=>\s*\(\{\s*rows:\s*\[\]/.test(handler)) {
    problems.push(`${ROUTE}: accidents list still uses SELECT * and/or a catch-swallow — a failed query renders as an empty all-clear.`);
  }

  // Frontend: EntityLink columns carry the name as label, filters match the name.
  if (!/kind="driver"[\s\S]{0,120}label=\{\(row\.driver_name/.test(page)) {
    problems.push(`${PAGE}: the Driver EntityLink does not pass driver_name as label — it shows the raw uuid.`);
  }
  if (!/kind="unit"[\s\S]{0,120}label=\{\(row\.unit_number/.test(page)) {
    problems.push(`${PAGE}: the Unit EntityLink does not pass unit_number as label — it shows the raw uuid.`);
  }
  if (!/row\.driver_name/.test(page) || !/row\.unit_number/.test(page)) {
    problems.push(`${PAGE}: filters/columns never reference driver_name/unit_number — they still key on the raw uuid.`);
  }

  return problems;
}

if (SELFTEST) {
  const live = { [ROUTE]: read(ROUTE), [PAGE]: read(PAGE) };
  const failures = [];
  const expectCaught = (name, mutated, needle) => {
    if (JSON.stringify(mutated) === JSON.stringify(live)) {
      failures.push(`${name}: inert mutation`);
      return;
    }
    const problems = assertAccidentsNames(mutated);
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: NOT caught (expected "${needle}", got: ${problems.join(" | ") || "none"})`);
    }
  };

  // 1. backend reverts to SELECT * with a swallow.
  expectCaught(
    "backend-select-star-swallow",
    {
      ...live,
      [ROUTE]: live[ROUTE].replace(
        // Replace the whole entity-joined query call with a SELECT * and catch-swallow.
        /const res = await client\.query\(\s*[\s\S]*?\s*,\s*values\s*\);/,
        "const res = await client.query(`SELECT * FROM safety.accident_reports WHERE operating_company_id = $1 ORDER BY accident_at DESC LIMIT 500`, [query.data.operating_company_id]).catch(() => ({ rows: [] }));"
      ),
    },
    "SELECT * and/or a catch-swallow"
  );
  // 2. unit join loses its owner/lessee scope.
  expectCaught(
    "unit-unscoped",
    { ...live, [ROUTE]: live[ROUTE].replace(/AND \(u\.owner_company_id = ar\.operating_company_id\n\s*OR u\.currently_leased_to_company_id = ar\.operating_company_id\)/, "") },
    "not scoped by owner_company_id",
  );
  // 3. frontend drops the driver name label.
  expectCaught(
    "no-driver-label",
    {
      ...live,
      [PAGE]: live[PAGE].replace(
        /label=\{\(row\.driver_name as string \| undefined\)(?:\?\.trim\(\) \|\| "Driver"| \?\? undefined)\}/,
        'label={undefined}',
      ),
    },
    "does not pass driver_name as label",
  );
  const liveProblems = assertAccidentsNames(live);
  if (liveProblems.length) failures.push(`live sources FAIL: ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 3 planted defects caught, live sources clean`);
  process.exit(0);
}

const problems = assertAccidentsNames();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — accidents list renders driver/unit names (owner-lessee scoped), no swallow`);
