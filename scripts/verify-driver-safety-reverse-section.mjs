#!/usr/bin/env node
/**
 * GUARD: the driver profile shows the driver's safety records (SAF-F16 / Law §9 reverse linkage).
 *
 * WHY THIS EXISTS (2026-07-23 audit)
 * `safety.civil_fines.subject_driver_id`, `safety.internal_fines.driver_id`,
 * `safety.complaints.complainant_driver_id/respondent_driver_id` and
 * `safety.da_test_records.driver_uuid` are all canonical FKs to `mdata.drivers` — every one of them
 * persisted FORWARD and none was readable from the driver. Opening `/drivers/:id` showed the
 * internal safety-EVENT log and nothing else: no fine, no complaint, no drug/alcohol test.
 * DEFINITION-OF-DONE §1.C — forward persistence without a reverse surface is NOT done.
 *
 * Fix contract this guard pins:
 *   1. A driver-scoped Safety section component exists and reads ALL FOUR record types.
 *   2. DriverDetail (the `/drivers/:id` page) imports AND renders it with the driver's id — a
 *      component that exists but is not mounted is the classic fake fix.
 *   3. Scoping is SERVER-SIDE in SQL on both routes that previously had no driver param. Each list
 *      is capped at LIMIT 500, so a client-side `.filter()` silently under-reports past that cap.
 *   4. Complaints match EITHER side (complainant OR respondent) — a driver is on both sides of that
 *      table and showing only one side hides half their record.
 *   5. Money units are not crossed: civil fines are `amount_cents` (bigint cents → formatUsdCents),
 *      internal fines are `amount` (numeric DOLLARS → formatUsd). Mixing them is a 100x error.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SECTION = "apps/frontend/src/components/safety/DriverSafetyReverseSection.tsx";
const DRIVER_DETAIL = "apps/frontend/src/pages/DriverDetail.tsx";
// Two live driver routes exist — /drivers/:id (DriverDetail) and /drivers/:id/profile
// (DriverProfilePage) — both mount the section independently (same class of gap as
// CLS-LEGAL-DRIVER-REVERSE-UNGUARDED / CLS-INSURANCE-DRIVER-REVERSE-UNGUARDED this session).
const DRIVER_PROFILE = "apps/frontend/src/pages/drivers/DriverProfilePage.tsx";
const API = "apps/frontend/src/api/safety.ts";
const INTERNAL_FINES_ROUTE = "apps/backend/src/safety/safety-v5.routes.ts";
const COMPLAINTS_ROUTE = "apps/backend/src/routes/safety/complaints.ts";
const FILES = [SECTION, DRIVER_DETAIL, DRIVER_PROFILE, API, INTERNAL_FINES_ROUTE, COMPLAINTS_ROUTE];
const LABEL = "verify-driver-safety-reverse-section";
const SELFTEST = process.argv.includes("--selftest");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/** The four record types the driver's safety file must surface, and the read that proves it. */
const REQUIRED_READS = [
  { label: "external/civil fines", needle: "getSafetyFines(", scope: "subject_driver_id: driverId" },
  { label: "internal fines", needle: "getInternalFines(", scope: "driver_id: driverId" },
  { label: "complaints", needle: "getComplaints(", scope: "driver_id: driverId" },
  { label: "drug & alcohol tests", needle: "getDriverDrugAlcoholTests(", scope: "driverId" },
];

export function assertDriverSafetyReverse(sources) {
  const src = {};
  for (const rel of FILES) src[rel] = stripComments(sources?.[rel] ?? read(rel));
  const problems = [];

  // 1. The section reads all four record types, each scoped to THIS driver.
  for (const { label, needle, scope } of REQUIRED_READS) {
    if (!src[SECTION].includes(needle)) {
      problems.push(`${SECTION}: does not read ${label} (${needle}) — that record type is invisible on the driver profile.`);
      continue;
    }
    if (!src[SECTION].includes(scope)) {
      problems.push(`${SECTION}: ${label} read is not scoped to this driver (missing \`${scope}\`).`);
    }
  }

  // 2. Mounted on BOTH live driver routes — existing-but-unmounted is a fake fix.
  if (!src[DRIVER_DETAIL].includes("DriverSafetyReverseSection")) {
    problems.push(`${DRIVER_DETAIL}: does not import DriverSafetyReverseSection — the section is not on the driver profile.`);
  } else if (!/<DriverSafetyReverseSection[\s\S]{0,200}driverId=/.test(src[DRIVER_DETAIL])) {
    problems.push(`${DRIVER_DETAIL}: DriverSafetyReverseSection is imported but not rendered with driverId.`);
  }
  if (!src[DRIVER_PROFILE].includes("DriverSafetyReverseSection")) {
    problems.push(`${DRIVER_PROFILE}: does not import DriverSafetyReverseSection — the /drivers/:id/profile route has no safety reverse section.`);
  } else if (!/<DriverSafetyReverseSection[\s\S]{0,200}driverId=/.test(src[DRIVER_PROFILE])) {
    problems.push(`${DRIVER_PROFILE}: DriverSafetyReverseSection is imported but not rendered with driverId.`);
  }

  // 3. Server-side scoping (NOT a client-side filter over a LIMIT 500 company list).
  if (!/f\.driver_id = \$\$\{values\.length\}|f\.driver_id = \$/.test(src[INTERNAL_FINES_ROUTE])) {
    problems.push(`${INTERNAL_FINES_ROUTE}: GET internal-fines does not filter by driver in SQL — a client-side filter drops rows past LIMIT 500.`);
  }
  if (!src[API].includes(`qs.set("driver_id", params.driver_id)`)) {
    problems.push(`${API}: driver_id is not sent to the internal-fines/complaints routes — the server filter is unreachable.`);
  }

  // 4. Complaints match either side of the record.
  const complaintsSql = src[COMPLAINTS_ROUTE];
  if (!complaintsSql.includes("complainant_driver_id = $") || !complaintsSql.includes("respondent_driver_id = $")) {
    problems.push(`${COMPLAINTS_ROUTE}: driver filter does not match BOTH complainant_driver_id and respondent_driver_id — half the driver's complaints stay hidden.`);
  }

  // 5. Money units not crossed (civil = cents, internal = dollars).
  if (!/formatUsdCents\(fine\.amount_cents/.test(src[SECTION])) {
    problems.push(`${SECTION}: civil fine amount must render via formatUsdCents(amount_cents) — safety.civil_fines.amount_cents is integer cents.`);
  }
  if (!/formatUsd\(fine\.amount /.test(src[SECTION])) {
    problems.push(`${SECTION}: internal fine amount must render via formatUsd(amount) — safety.internal_fines.amount is numeric DOLLARS; using formatUsdCents divides by 100.`);
  }

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
    const problems = assertDriverSafetyReverse(mutated);
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(`${name}: NOT caught (expected "${needle}", got: ${problems.join(" | ") || "none"})`);
    }
  };

  // 1. a record type is dropped from the section.
  expectCaught(
    "record-type-dropped",
    { ...live, [SECTION]: live[SECTION].replace(/getDriverDrugAlcoholTests\(/g, "noopRemoved(") },
    "does not read drug & alcohol tests"
  );
  // 2. a read stops being driver-scoped (shows the whole company on one driver's page).
  expectCaught(
    "read-not-driver-scoped",
    { ...live, [SECTION]: live[SECTION].replace(/subject_driver_id: driverId/g, "status: undefined") },
    "not scoped to this driver"
  );
  // 3. the section exists but is not mounted on the driver profile (either live route).
  expectCaught(
    "not-mounted-driver-detail",
    { ...live, [DRIVER_DETAIL]: live[DRIVER_DETAIL].replace(/DriverSafetyReverseSection/g, "SomeOtherSection") },
    "does not import DriverSafetyReverseSection"
  );
  expectCaught(
    "not-mounted-driver-profile",
    { ...live, [DRIVER_PROFILE]: live[DRIVER_PROFILE].replace(/DriverSafetyReverseSection/g, "SomeOtherSection") },
    "does not import DriverSafetyReverseSection"
  );
  // 4. server-side driver filter removed from the internal-fines SQL.
  expectCaught(
    "internal-fines-filter-removed",
    { ...live, [INTERNAL_FINES_ROUTE]: live[INTERNAL_FINES_ROUTE].replace(/f\.driver_id = \$\$\{values\.length\}/g, "TRUE") },
    "does not filter by driver in SQL"
  );
  // 5. complaints match only the respondent side.
  expectCaught(
    "complaints-one-sided",
    { ...live, [COMPLAINTS_ROUTE]: live[COMPLAINTS_ROUTE].replace(/complainant_driver_id = \$\$\{values\.length\} OR /g, "") },
    "does not match BOTH complainant_driver_id and respondent_driver_id"
  );
  // 6. driver_id never leaves the client.
  expectCaught(
    "driver-id-not-sent",
    { ...live, [API]: live[API].replace(/qs\.set\("driver_id", params\.driver_id\)/g, "void 0") },
    "driver_id is not sent"
  );
  // 7. money units crossed — internal fine dollars rendered as cents.
  expectCaught(
    "money-units-crossed",
    { ...live, [SECTION]: live[SECTION].replace(/formatUsd\(fine\.amount /g, "formatUsdCents(fine.amount ") },
    "safety.internal_fines.amount is numeric DOLLARS"
  );

  // The corrected shape must NOT be flagged — false positives burn trust as fast as misses.
  const liveProblems = assertDriverSafetyReverse(live);
  if (liveProblems.length) failures.push(`live sources FAIL (false positive): ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 8 planted defects caught, live sources clean`);
  process.exit(0);
}

const problems = assertDriverSafetyReverse();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(
  `${LABEL} OK — driver profile surfaces external fines, internal fines, complaints and D&A tests, driver-scoped in SQL`
);
