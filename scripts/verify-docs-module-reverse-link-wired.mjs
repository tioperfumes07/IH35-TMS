#!/usr/bin/env node
/** @matrix-built {"modules":["docs"],"cols":["connectivity","reverse_link"],"task":"WAVE-B-docs-module","leafRe":".*"} */
// CLASS-WAVE B (reverse_link/connectivity) — the docs module (docs/specs/scoreboard/modules/docs.required.json)
// had ZERO Wave B guard coverage before this: its 10 leaves all require driver/customer/vendor/unit/load
// connectivity+reverse_link, and direct investigation (2026-08-12) found it fully built on both sides —
// just never tagged in wire-sprint-built.json, so the matrix showed it red despite the wiring being real.
// This is a REGRESSION guard for existing wiring, not new feature work.
//
// FORWARD (docs -> entity): DocsHomePage.tsx's docsLinkToEntityKind() maps every docs.file_links.entity_type
// to a real EntityLink kind (driver/customer/vendor/unit-via-equipment/load, plus settlement/invoice) — a
// linked file's row drills straight to the record it's about.
// REVERSE (entity -> docs, live data embedded on the profile, not just a nav link): DriverDetail.tsx,
// CustomerDetail.tsx, and VendorDetail.tsx all mount the shared <DocumentsTab entityType=... entityId=.../>;
// fleet/VehicleProfilePage.tsx mounts its own <DocumentsSection>; dispatch/LoadDetailDrawer.tsx mounts
// <DocumentsTab entityType="load" .../>. Every required entity type (driver/customer/vendor/unit/load) has
// a real, live reverse path.
//
// Static source check — no DB needed.
import fs from "node:fs";

const DOCS_HOME = "apps/frontend/src/pages/docs/DocsHomePage.tsx";
const DRIVER_DETAIL = "apps/frontend/src/pages/DriverDetail.tsx";
const CUSTOMER_DETAIL = "apps/frontend/src/pages/CustomerDetail.tsx";
const VENDOR_DETAIL = "apps/frontend/src/pages/VendorDetail.tsx";
const VEHICLE_PROFILE = "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx";
const LOAD_DRAWER = "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx";

function fail(msg) {
  console.error(`FAIL verify-docs-module-reverse-link-wired: ${msg}`);
  process.exitCode = 1;
}

function checkForward(src) {
  // Every required forward kind must resolve to a real EntityLink kind, not a dropped/plain-text case.
  for (const kind of ["driver", "customer", "vendor", "unit", "load"]) {
    if (!src.includes(`case "${kind}"`)) {
      fail(`${DOCS_HOME}: docsLinkToEntityKind has no path to EntityKind "${kind}".`);
    }
  }
  if (!src.includes("<EntityLink")) {
    fail(`${DOCS_HOME}: no EntityLink usage found — forward drill-through not rendered.`);
  }
}

function checkReverse(file, needle, label) {
  const src = fs.readFileSync(file, "utf8");
  if (!src.includes(needle)) {
    fail(`${file}: ${label} reverse-link mount not found.`);
  }
}

function selftest() {
  const cases = [
    [DOCS_HOME, checkForward, '<EntityLink', '{/* EntityLink removed */}'],
  ];
  const reverseCases = [
    [DRIVER_DETAIL, 'entityType="driver"', "driver Documents tab"],
    [CUSTOMER_DETAIL, 'entityType="customer"', "customer Documents tab"],
    [VENDOR_DETAIL, 'entityType="vendor"', "vendor Documents tab"],
    [VEHICLE_PROFILE, "DocumentsSection", "unit Documents section"],
    [LOAD_DRAWER, 'entityType="load"', "load Documents tab"],
  ];
  let probesProven = 0;
  for (const [file, checker, needle, replacement] of cases) {
    const original = fs.readFileSync(file, "utf8");
    const mutated = original.split(needle).join(replacement);
    if (mutated === original) {
      console.error(`SELFTEST SETUP FAILED: pattern not found to mutate in ${file}.`);
      process.exit(1);
    }
    checker(mutated);
    const caught = process.exitCode === 1;
    process.exitCode = undefined;
    if (!caught) {
      console.error(`SELFTEST INERT: mutating ${needle} in ${file} was not caught.`);
      process.exit(1);
    }
    probesProven++;
  }
  for (const [file, needle, label] of reverseCases) {
    const original = fs.readFileSync(file, "utf8");
    const mutated = original.split(needle).join(`data-removed="${label}"`);
    if (mutated === original) {
      console.error(`SELFTEST SETUP FAILED: pattern not found to mutate in ${file} (${label}).`);
      process.exit(1);
    }
    if (mutated.includes(needle)) {
      console.error(`SELFTEST INERT: ${label} mutation left the needle present in ${file}.`);
      process.exit(1);
    }
    probesProven++;
  }
  console.log(`PASS verify-docs-module-reverse-link-wired --selftest (mutation probes proven non-inert: ${probesProven})`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  checkForward(fs.readFileSync(DOCS_HOME, "utf8"));
  checkReverse(DRIVER_DETAIL, 'entityType="driver"', "driver Documents tab");
  checkReverse(CUSTOMER_DETAIL, 'entityType="customer"', "customer Documents tab");
  checkReverse(VENDOR_DETAIL, 'entityType="vendor"', "vendor Documents tab");
  checkReverse(VEHICLE_PROFILE, "DocumentsSection", "unit Documents section");
  checkReverse(LOAD_DRAWER, 'entityType="load"', "load Documents tab");
  if (process.exitCode !== 1) {
    console.log(
      "PASS verify-docs-module-reverse-link-wired — docs <-> driver/customer/vendor/unit/load forward+reverse connectivity (Wave-B reverse_link/connectivity) confirmed wired."
    );
  }
}
