#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch","safety"],"cols":["trailer"],"leafRe":"^(dispatch\\.modal\\.(book_load_modal_v4|quick_assign)|damage_reports\\.(list|create)|cargo_claims\\.create)$","task":"WAVE-A-trailer-exact-surfaces","vertical":"column-wave"} */
import fs from "node:fs";

const SELFTEST = process.argv.includes("--selftest");

const checks = [
  ["apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx", /assigned_trailer_unit_id:\s*values\.assigned_trailer_unit_id\s*\|\|\s*undefined/],
  ["apps/frontend/src/pages/dispatch/components/QuickAssignModal.tsx", /trailer_id:\s*trailerId\s*\|\|\s*undefined/],
  ["apps/frontend/src/pages/dispatch/DispatchBoard.tsx", /<EntityLink[\s\S]*kind="trailer"[\s\S]*trailer_id/],
  ["apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx", /trailer_id:\s*str\(selected\.trailer_id\)\s*\|\|\s*null/],
  ["apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx", /<EntityLink[\s\S]*kind="trailer"[\s\S]*id=\{String\(detail\.trailer_id\)\}/],
  ["apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx", /trailer_id:\s*form\.trailerId\s*\|\|\s*null/],
];

function auditSources(readSource = (file) => fs.readFileSync(file, "utf8")) {
  const failures = checks
    .filter(([file, pattern]) => !pattern.test(readSource(file)))
    .map(([file]) => `${file}: trailer FK/link contract missing`);

  const dispatchSources = [
    "apps/frontend/src/api/dispatch.ts",
    "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx",
  ];
  for (const file of dispatchSources) {
    const source = readSource(file);
    if (/persist(?:ed|s|ing)?[^\n]{0,80}(?:to|through|\u2192)\s+(?:mdata\.)?loads\.trailer_id/i.test(source)) {
      failures.push(`${file}: falsely claims the trailer FK is persisted to phantom loads.trailer_id`);
    }
    if (!/dispatch\.load_assignment_history\.new_trailer_id/.test(source)) {
      failures.push(`${file}: does not name the canonical trailer assignment-history FK`);
    }
  }
  return failures;
}

const failures = auditSources();
if (failures.length) {
  console.error(`verify-wave-a-trailer-column FAIL:\n${failures.map((failure) => ` - ${failure}`).join("\n")}`);
  process.exit(1);
}

if (SELFTEST) {
  const target = "apps/frontend/src/api/dispatch.ts";
  const planted = auditSources((file) => {
    const source = fs.readFileSync(file, "utf8");
    return file === target ? `${source}\n// persisted to mdata.loads.trailer_id\n` : source;
  });
  if (!planted.some((failure) => failure.includes("phantom loads.trailer_id"))) {
    console.error("verify-wave-a-trailer-column SELFTEST FAIL — phantom-column mutation was not detected");
    process.exit(1);
  }
  console.log("verify-wave-a-trailer-column SELFTEST PASS — phantom-column mutation detected");
  process.exit(0);
}
console.log("verify-wave-a-trailer-column PASS — trailer create, assignment-history, and reverse links ratcheted");
