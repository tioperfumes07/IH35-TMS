#!/usr/bin/env node
/** @matrix-built {"modules":["lists","dispatch","safety"],"cols":["trailer"],"leafRe":".*","task":"WAVE-A-trailer","vertical":"column-wave"} */
import fs from "node:fs";

const checks = [
  ["apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx", /assigned_trailer_unit_id:\s*values\.assigned_trailer_unit_id\s*\|\|\s*undefined/],
  ["apps/frontend/src/pages/dispatch/components/QuickAssignModal.tsx", /trailer_id:\s*trailerId\s*\|\|\s*undefined/],
  ["apps/frontend/src/pages/dispatch/DispatchBoard.tsx", /<EntityLink[\s\S]*kind="trailer"[\s\S]*trailer_id/],
  ["apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx", /trailer_id:\s*str\(selected\.trailer_id\)\s*\|\|\s*null/],
  ["apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx", /<EntityLink[\s\S]*kind="trailer"[\s\S]*id=\{String\(detail\.trailer_id\)\}/],
  ["apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx", /trailer_id:\s*form\.trailerId\s*\|\|\s*null/],
];

const failures = checks.filter(([file, pattern]) => !pattern.test(fs.readFileSync(file, "utf8"))).map(([file]) => `${file}: trailer FK/link contract missing`);
if (failures.length) {
  console.error(`verify-wave-a-trailer-column FAIL:\n${failures.map((failure) => ` - ${failure}`).join("\n")}`);
  process.exit(1);
}
console.log("verify-wave-a-trailer-column PASS — trailer create, assignment-history, and reverse links ratcheted");
