#!/usr/bin/env node
/**
 * GUARD: external-fine surfaces show the driver NAME, never a raw subject_driver_id uuid (SAF-F18).
 *
 * WHY THIS EXISTS (2026-07-23 audit, verified in source)
 * The fines list backend did `SELECT * FROM safety.civil_fines` with no driver join, FinesPage had no
 * Driver column, and FineDetailDrawer rendered `driverLabel={String(fine.subject_driver_id)}` — so the
 * convert-confirm modal said "…from <uuid>'s next settlement". An operator saw a raw uuid where a
 * person's name belongs.
 *
 * Fix contract (all must hold, or a name / reverse filter can silently regress):
 *   - backend list + detail JOIN mdata.drivers and return subject_driver_name (entity-scoped),
 *   - FinesPage renders a Driver column via EntityLink kind="driver",
 *   - FineDetailDrawer's convert driverLabel prefers subject_driver_name over the raw uuid,
 *   - LST-F5163F: FinesPage filterBar has visible EntityPicker driver+unit (allowCreate=false)
 *     + Unit EntityLink column (URL-only subject_driver_id/related_unit_id is not reverse).
 *
 * @matrix-built leafRe:safety\\.fines\\.list|safety\\.external.fines
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTE = "apps/backend/src/safety/fines.routes.ts";
const PAGE = "apps/frontend/src/pages/safety/FinesPage.tsx";
const DRAWER = "apps/frontend/src/pages/safety/components/FineDetailDrawer.tsx";
const LABEL = "verify-fines-driver-name-not-uuid";
const SELFTEST = process.argv.includes("--selftest");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

export function assertFinesDriverName(sources) {
  const route = stripComments(sources?.[ROUTE] ?? read(ROUTE));
  const page = stripComments(sources?.[PAGE] ?? read(PAGE));
  const drawer = stripComments(sources?.[DRAWER] ?? read(DRAWER));
  const problems = [];

  // Backend must join and expose the name (both list and detail).
  const joinCount = (route.match(/LEFT JOIN mdata\.drivers/g) ?? []).length;
  if (joinCount < 2) {
    problems.push(`${ROUTE}: expected the driver-name LEFT JOIN on BOTH the list and the detail query (found ${joinCount}).`);
  }
  if (!/AS subject_driver_name/.test(route)) {
    problems.push(`${ROUTE}: does not expose subject_driver_name — the UI has only the raw uuid to show.`);
  }
  // A bare `SELECT * FROM safety.civil_fines` (no cf. alias) means the join was dropped.
  if (/SELECT \* FROM safety\.civil_fines\b/.test(route)) {
    problems.push(`${ROUTE}: a fines query still does SELECT * with no driver join — the name will be missing.`);
  }

  // FinesPage must render a Driver column via EntityLink.
  if (!/label:\s*"Driver"/.test(page)) {
    problems.push(`${PAGE}: no "Driver" column — the fine's subject driver is not shown.`);
  }
  if (!/EntityLink[\s\S]{0,120}kind="driver"/.test(page)) {
    problems.push(`${PAGE}: the Driver column does not drill through via EntityLink kind="driver".`);
  }

  // LST-F5163F: visible reverse filters (URL query alone is not reverse).
  if (!/dataTestId="fines-filter-driver"/.test(page) || !/kind="driver"[\s\S]{0,200}allowCreate=\{false\}/.test(page)) {
    problems.push(`${PAGE}: missing EntityPicker kind=driver allowCreate=false filter (fines-filter-driver).`);
  }
  if (!/dataTestId="fines-filter-unit"/.test(page) || !/kind="unit"[\s\S]{0,200}allowCreate=\{false\}/.test(page)) {
    problems.push(`${PAGE}: missing EntityPicker kind=unit allowCreate=false filter (fines-filter-unit).`);
  }
  if (!/label:\s*"Unit"/.test(page) || !/EntityLink[\s\S]{0,120}kind="unit"/.test(page)) {
    problems.push(`${PAGE}: no Unit EntityLink column — related_unit reverse is incomplete.`);
  }
  if (!/subject_driver_id/.test(page) || !/related_unit_id/.test(page)) {
    problems.push(`${PAGE}: list query must pass subject_driver_id and related_unit_id filters.`);
  }

  // The convert-confirm driverLabel must prefer the name over the raw uuid.
  if (/driverLabel=\{String\(fine\.subject_driver_id\b/.test(drawer)) {
    problems.push(`${DRAWER}: driverLabel still passes the raw subject_driver_id uuid — prefer subject_driver_name.`);
  }
  if (!/subject_driver_name/.test(drawer)) {
    problems.push(`${DRAWER}: never references subject_driver_name — it cannot show the name.`);
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
    const problems = assertFinesDriverName(mutated);
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: NOT caught (expected "${needle}", got: ${problems.join(" | ") || "none"})`);
    }
  };

  // 1. backend reverts the list join to SELECT *.
  //
  // RE-ANCHOR (found stale 2026-08-29): the mutation targeted a literal `LIMIT 500` end marker,
  // but the list query was since changed to real pagination (`LIMIT $N OFFSET $N`) — "LIMIT 500"
  // no longer appears anywhere in this file, so the mutation was a genuine no-op (inert). Bound the
  // mutation to the LIST route's own registration (through the next route, GET .../:id) and replace
  // its SELECT cf.* clause specifically, instead of relying on a literal suffix that can drift again.
  {
    const listStart = live[ROUTE].indexOf('app.get("/api/v1/safety/fines",');
    const listEnd = live[ROUTE].indexOf('app.get("/api/v1/safety/fines/:id"', listStart);
    const listHandler = listStart === -1 || listEnd === -1 ? "" : live[ROUTE].slice(listStart, listEnd);
    const mutatedHandler = listHandler.replace(
      /SELECT cf\.\*,[\s\S]*?FROM safety\.civil_fines cf[\s\S]*?LEFT JOIN mdata\.drivers d[\s\S]*?\)\s*\n\s*\)/,
      "SELECT * FROM safety.civil_fines cf"
    );
    if (!listHandler || mutatedHandler === listHandler) {
      failures.push("backend-select-star-setup FAIL: could not locate the fines-list SELECT/driver-join to mutate");
    } else {
      expectCaught(
        "backend-select-star",
        { ...live, [ROUTE]: live[ROUTE].replace(listHandler, mutatedHandler) },
        "SELECT * with no driver join"
      );
    }
  }
  // 2. the Driver column is removed.
  expectCaught("no-driver-column", { ...live, [PAGE]: live[PAGE].replace(/label:\s*"Driver"/, 'label: "X"') }, 'no "Driver" column');
  // 2b. reverse driver filter removed.
  expectCaught(
    "no-driver-filter",
    { ...live, [PAGE]: live[PAGE].replace(/dataTestId="fines-filter-driver"/g, 'dataTestId="x"') },
    "fines-filter-driver",
  );
  // 2c. Unit column removed.
  expectCaught(
    "no-unit-column",
    { ...live, [PAGE]: live[PAGE].replace(/label:\s*"Unit"/, 'label: "X"') },
    "Unit EntityLink column",
  );
  // 3. the drawer reverts to the raw uuid label.
  expectCaught(
    "drawer-raw-uuid",
    {
      ...live,
      [DRAWER]: live[DRAWER]
        .replace(
          /driverLabel=\{\(fine\.subject_driver_name as string \| undefined\)\?\.trim\(\) \|\| "driver"\}/,
          'driverLabel={String(fine.subject_driver_id ?? "driver")}',
        )
        .replace(
          /driverLabel=\{String\(fine\.subject_driver_name \?\? fine\.subject_driver_id \?\? "driver"\)\}/,
          'driverLabel={String(fine.subject_driver_id ?? "driver")}',
        ),
    },
    "raw subject_driver_id uuid",
  );

  const liveProblems = assertFinesDriverName(live);
  if (liveProblems.length) failures.push(`live sources FAIL: ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 5 planted defects caught, live sources clean`);
  process.exit(0);
}

const problems = assertFinesDriverName();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — external-fine surfaces render the driver name, not a raw uuid`);
