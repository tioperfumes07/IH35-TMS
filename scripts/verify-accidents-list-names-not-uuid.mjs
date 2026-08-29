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
import { labelResolves } from "./lib/entity-label-detect.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTE = "apps/backend/src/safety/safety.routes.ts";
const PAGE = "apps/frontend/src/pages/safety/AccidentsPage.tsx";
const DRAWER = "apps/frontend/src/components/safety/AccidentReportDrawer.tsx";
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

function accidentDetailHandler(routeSrc) {
  const match = routeSrc.match(/app\.get\s*\(\s*["']\/api\/v1\/safety\/accidents\/:id["']/);
  if (!match) return "";
  const rest = routeSrc.slice(match.index);
  const end = rest.indexOf("app.post(\"/api/v1/safety/accidents\"");
  return end === -1 ? rest.slice(0, 7000) : rest.slice(0, end);
}

export function assertAccidentsNames(sources) {
  const route = stripComments(sources?.[ROUTE] ?? read(ROUTE));
  const page = stripComments(sources?.[PAGE] ?? read(PAGE));
  const drawer = stripComments(sources?.[DRAWER] ?? read(DRAWER));
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
  // The unit join itself must be owner/lessee scoped (units have NO operating_company_id). Do not
  // let the adjacent trailer join's identical columns satisfy this invariant.
  const unitJoin = handler.match(/LEFT JOIN mdata\.units[\s\S]*?(?=LEFT JOIN)/)?.[0] ?? "";
  if (unitJoin && !/u\.owner_company_id|u\.currently_leased_to_company_id/.test(unitJoin)) {
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
  //
  // ★ DETECTOR WIDENED 2026-08-11 (CLS-GUARD-LITERAL-DETECTION). These two checks used to demand the
  // literal `label={(row.driver_name` / `label={(row.unit_number`. The page moved to the shared helper
  // — `label={entityLabel((row.driver_name as string | undefined)?.trim(), row.driver_id, "Driver")}` —
  // and this guard reddened on a page that had become STRICTLY SAFER, while its selftest went INERT
  // because the mutation it plants targets a spelling the file no longer contains. Live prod renders
  // "Juan USMCA-Battery" / "TEST-UNIT-20260806-01" on /safety/accidents, so the SCREEN was never the
  // defect — the detector was. Accepted spelling widens; the assertion does not weaken, because
  // entityLabel additionally rejects a uuid-shaped value arriving in the name column.
  if (!labelResolves(page, { field: "driver_name", noun: "Driver" })) {
    problems.push(`${PAGE}: the Driver EntityLink does not resolve driver_name to a word — it shows the raw uuid.`);
  }
  if (!labelResolves(page, { field: "unit_number", noun: "Unit" })) {
    problems.push(`${PAGE}: the Unit EntityLink does not resolve unit_number to a word — it shows the raw uuid.`);
  }
  if (!/row\.driver_name/.test(page) || !/row\.unit_number/.test(page)) {
    problems.push(`${PAGE}: filters/columns never reference driver_name/unit_number — they still key on the raw uuid.`);
  }

  const detail = accidentDetailHandler(route);
  for (const [join, label] of [
    ["mdata.drivers", "driver_name"],
    ["mdata.units", "unit_number"],
    ["mdata.equipment", "trailer_number"],
    ["mdata.loads", "load_number"],
    ["mdata.vendors", "vendor_name"],
  ]) {
    if (!detail.includes(`LEFT JOIN ${join}`) || !detail.includes(label)) {
      problems.push(`${ROUTE}: exact accident detail does not resolve ${label} from ${join}.`);
    }
  }
  for (const [idName, labelName] of [
    ["initialDriverId", "initialDriverName"],
    ["initialUnitId", "initialUnitName"],
    ["initialTrailerId", "initialTrailerName"],
    ["initialVendorId", "initialVendorName"],
    ["initialLoadId", "initialLoadName"],
  ]) {
    const selected = new RegExp(`selectedOption=\\{[\\s\\S]{0,220}${idName}[\\s\\S]{0,220}label:\\s*${labelName}`);
    if (!selected.test(drawer)) {
      problems.push(`${DRAWER}: persisted ${idName} is not seeded with its human ${labelName}.`);
    }
  }

  return problems;
}

if (SELFTEST) {
  const live = { [ROUTE]: read(ROUTE), [PAGE]: read(PAGE), [DRAWER]: read(DRAWER) };
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
  //
  // RE-ANCHOR (found stale 2026-08-29): this file has MANY `const res = await client.query(` call
  // sites (other routes, same generic variable name) and several use a `values` array too. A
  // whole-file, non-greedy `/const res = await client\.query\([\s\S]*?,\s*values\s*\);/` matches
  // the FIRST such call site in THE ENTIRE FILE — not necessarily (and, live-checked, not actually)
  // the accidents-list handler's own query — so mutating "the query" silently mangled a different,
  // earlier route while leaving the accidents list handler (correctly scoped by
  // accidentsListHandler() above) completely untouched. Locate the handler first, replace ONLY
  // within its slice, then splice that back into the full file — the same discipline the real
  // check already uses.
  {
    const handler = accidentsListHandler(live[ROUTE]);
    const queryCallRe = /const res = await client\.query\(\s*[\s\S]*?\s*,\s*values\s*\);/;
    const mutatedHandler = handler.replace(
      queryCallRe,
      "const res = await client.query(`SELECT * FROM safety.accident_reports WHERE operating_company_id = $1 ORDER BY accident_at DESC LIMIT 500`, [query.data.operating_company_id]).catch(() => ({ rows: [] }));"
    );
    if (mutatedHandler === handler) {
      failures.push("backend-select-star-swallow-setup FAIL: query-call anchor not found inside the accidents-list handler slice");
    } else {
      expectCaught(
        "backend-select-star-swallow",
        { ...live, [ROUTE]: live[ROUTE].replace(handler, mutatedHandler) },
        "SELECT * and/or a catch-swallow"
      );
    }
  }
  // 4. exact-read loses trailer label resolution, recreating raw UUID text in deep-link drawers.
  expectCaught(
    "detail-no-trailer-label",
    { ...live, [ROUTE]: live[ROUTE].replaceAll("tr.equipment_number AS trailer_number", "NULL AS trailer_label") },
    "does not resolve trailer_number",
  );
  // 5. drawer stops seeding a persisted trailer with the detail API's human option.
  expectCaught(
    "drawer-no-trailer-selected-option",
    { ...live, [DRAWER]: live[DRAWER].replace("label: initialTrailerName", "label: initialTrailerId") },
    "initialTrailerId is not seeded",
  );
  // 2. unit join loses its owner/lessee scope.
  expectCaught(
    "unit-unscoped",
    { ...live, [ROUTE]: live[ROUTE].replace(/AND \(u\.owner_company_id = ar\.operating_company_id\n\s*OR u\.currently_leased_to_company_id = ar\.operating_company_id\)/, "") },
    "not scoped by owner_company_id",
  );
  // 3. frontend drops the driver name label.
  //
  // The old mutation named the INLINE spelling verbatim; once the page moved to entityLabel() it
  // matched nothing, so this case planted no change and `expectCaught` scored it "inert mutation" —
  // the guard was certifying a detector that had not run. The mutation now targets whichever label
  // expression actually references driver_name, so it cannot go inert as the spelling evolves.
  expectCaught(
    "no-driver-label",
    {
      ...live,
      [PAGE]: live[PAGE].replace(/label=\{[^}]*row\.driver_name[^}]*\}/, "label={undefined}"),
    },
    "does not resolve driver_name",
  );
  // 3b. the same for the unit column — half a fix is how this class survived the first pass.
  expectCaught(
    "no-unit-label",
    {
      ...live,
      [PAGE]: live[PAGE].replace(/label=\{[^}]*row\.unit_number[^}]*\}/, "label={row.unit_id}"),
    },
    "does not resolve unit_number",
  );
  // 3c. the LEGACY inline spelling must still be accepted — widening must not orphan the old form.
  {
    const legacy = {
      ...live,
      [PAGE]: live[PAGE].replace(
        /label=\{[^}]*row\.driver_name[^}]*\}/,
        'label={(row.driver_name as string | undefined)?.trim() || "Driver"}',
      ),
    };
    if (JSON.stringify(legacy) === JSON.stringify(live)) {
      failures.push("legacy-spelling-accepted: inert mutation");
    } else if (assertAccidentsNames(legacy).some((p) => p.includes("driver_name"))) {
      failures.push("legacy-spelling-accepted: the legacy inline spelling must still pass");
    }
  }
  const liveProblems = assertAccidentsNames(live);
  if (liveProblems.length) failures.push(`live sources FAIL: ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — list labels + exact-detail joins + persisted picker labels mutation-tested`);
  process.exit(0);
}

const problems = assertAccidentsNames();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — accident list/detail + persisted pickers resolve human labels, no swallow`);
