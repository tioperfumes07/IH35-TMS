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
 * Fix contract (all three must hold, or a name can silently regress to a uuid):
 *   - backend list + detail JOIN mdata.drivers and return subject_driver_name (entity-scoped),
 *   - FinesPage renders a Driver column via EntityLink kind="driver",
 *   - FineDetailDrawer's convert driverLabel prefers subject_driver_name over the raw uuid.
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
  expectCaught(
    "backend-select-star",
    {
      ...live,
      [ROUTE]: live[ROUTE].replace(
        /SELECT cf\.\*,[\s\S]*?LIMIT 500/,
        "SELECT * FROM safety.civil_fines WHERE cf.operating_company_id = $1 LIMIT 500"
      ),
    },
    "SELECT * with no driver join"
  );
  // 2. the Driver column is removed.
  expectCaught("no-driver-column", { ...live, [PAGE]: live[PAGE].replace(/label:\s*"Driver"/, 'label: "X"') }, 'no "Driver" column');
  // 3. the drawer reverts to the raw uuid label.
  expectCaught(
    "drawer-raw-uuid",
    { ...live, [DRAWER]: live[DRAWER].replace(/driverLabel=\{String\(fine\.subject_driver_name \?\? fine\.subject_driver_id \?\? "driver"\)\}/, 'driverLabel={String(fine.subject_driver_id ?? "driver")}') },
    "raw subject_driver_id uuid"
  );

  const liveProblems = assertFinesDriverName(live);
  if (liveProblems.length) failures.push(`live sources FAIL: ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 3 planted defects caught, live sources clean`);
  process.exit(0);
}

const problems = assertFinesDriverName();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — external-fine surfaces render the driver name, not a raw uuid`);
