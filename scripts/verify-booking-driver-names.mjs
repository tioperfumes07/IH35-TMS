#!/usr/bin/env node
/**
 * verify-booking-driver-names.mjs (DRIVER-NAMES-IN-BOOKING)
 *
 * The Book Load driver dropdown must show REAL driver names. `mdata.drivers` exposes
 * first_name / last_name and has NO full_name column (CLAUDE.md §4 — a recurring blank-label and
 * 500 source). A picker that reaches for full_name, or falls through to "Driver N", silently hides
 * who is actually on the load.
 *
 * FOLLOWS THE CODE (updated 2026-07-22): this guard originally pinned the composition to a local
 * `toDriverOption()` inside BookLoadEquipmentSection.tsx. PLUS-DRIVER-SYSTEM replaced that local
 * helper with the shared <DriverPickerWithCreate>, which composes the label identically
 * (`[driver.first_name, driver.last_name].filter(Boolean).join(" ")`). Behaviour is preserved, so
 * the guard now asserts the CONTRACT at its new home instead of a function name that no longer
 * exists. The guard follows the refactor — it is NOT relaxed: it still fails if either the booking
 * section or the shared picker stops composing from first/last, and it additionally fails on any
 * phantom `full_name` reference, which the original never checked.
 *
 * Accepted shapes:
 *   A. booking renders <DriverPickerWithCreate> AND that component composes from first+last, or
 *   B. booking still has a local toDriverOption() composing from first+last.
 *
 * Run: node scripts/verify-booking-driver-names.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const BOOKING = "apps/frontend/src/pages/dispatch/components/BookLoadEquipmentSection.tsx";
const SHARED = "apps/frontend/src/components/drivers/DriverPickerWithCreate.tsx";
const LABEL = "verify-booking-driver-names";

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

/** first_name and last_name both feed the label, close together, in that order. */
export const composesFromFirstLast = (src) => /first_name[\s\S]{0,160}last_name/.test(src);

/** A picker must never source the label from a non-existent drivers.full_name column. */
export const usesPhantomFullName = (src) => /\bfull_name\b/.test(src);

export function checkBookingDriverNames({ booking, shared }) {
  const failures = [];
  const usesShared = /DriverPickerWithCreate/.test(booking);
  const hasLocal = /toDriverOption/.test(booking);

  if (!usesShared && !hasLocal) {
    failures.push(
      `${BOOKING}: driver dropdown must either render <DriverPickerWithCreate> or keep a local toDriverOption() — neither found`,
    );
    return failures;
  }

  if (hasLocal && !composesFromFirstLast(booking)) {
    failures.push(`${BOOKING}: local toDriverOption must compose the label from first_name + last_name`);
  }

  if (usesShared) {
    if (shared === null) {
      failures.push(`${SHARED}: booking uses <DriverPickerWithCreate> but that component is missing`);
    } else {
      if (!composesFromFirstLast(shared)) {
        failures.push(`${SHARED}: must compose the driver label from first_name + last_name (mdata.drivers has no full_name)`);
      }
      if (usesPhantomFullName(shared)) {
        failures.push(`${SHARED}: references drivers.full_name — that column does not exist (CLAUDE.md §4)`);
      }
    }
  }

  if (usesPhantomFullName(booking)) {
    failures.push(`${BOOKING}: references drivers.full_name — that column does not exist (CLAUDE.md §4)`);
  }

  return failures;
}

function selftest() {
  const problems = [];
  const goodShared = `label: [driver.first_name, driver.last_name].filter(Boolean).join(" ").trim() || driver.id,`;
  const goodBookingShared = `import { DriverPickerWithCreate } from "../../../components/drivers/DriverPickerWithCreate";`;
  const goodBookingLocal = `function toDriverOption(row){ const composed = [rec.first_name, rec.last_name].filter(Boolean).join(" "); return { label: composed }; }`;

  if (checkBookingDriverNames({ booking: goodBookingShared, shared: goodShared }).length)
    problems.push("shared-picker good fixture rejected");
  if (checkBookingDriverNames({ booking: goodBookingLocal, shared: goodShared }).length)
    problems.push("local-helper good fixture rejected");

  const cases = [
    ["shared loses first/last", { booking: goodBookingShared, shared: `label: driver.name` }, "first_name + last_name"],
    ["shared reaches for full_name", { booking: goodBookingShared, shared: `${goodShared} const x = driver.full_name;` }, "full_name"],
    ["local helper loses first/last", { booking: `function toDriverOption(){ return { label: rec.name }; }`, shared: goodShared }, "first_name + last_name"],
    ["booking has neither picker", { booking: `const drivers = [];`, shared: goodShared }, "neither found"],
    ["shared component missing", { booking: goodBookingShared, shared: null }, "component is missing"],
  ];
  for (const [name, fixture, fragment] of cases) {
    const failures = checkBookingDriverNames(fixture);
    if (!failures.some((f) => f.includes(fragment)))
      problems.push(`planted regression "${name}" NOT caught — assertion ineffective`);
  }

  if (problems.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const p of problems) console.error("  •", p);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK — 2 good fixtures pass; ${cases.length} planted regressions caught`);
}

function main() {
  const booking = read(BOOKING);
  let shared = null;
  try { shared = read(SHARED); } catch { shared = null; }

  const failures = checkBookingDriverNames({ booking, shared });
  if (failures.length) {
    console.error(`${LABEL} FAIL:`);
    for (const f of failures) console.error(" -", f);
    process.exit(1);
  }
  console.log(`${LABEL} OK — booking driver dropdown shows real first/last names (no phantom full_name).`);
}

if (process.argv.includes("--selftest")) selftest();
else main();
