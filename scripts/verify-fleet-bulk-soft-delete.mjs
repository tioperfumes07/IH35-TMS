#!/usr/bin/env node
// Guard (FLEET-BULK-INACTIVATE): the Fleet bulk "Inactivate" path must be a SOFT delete —
// it hits the canonical per-unit /deactivate endpoints (units + equipment) and must NEVER
// hard-delete (no DELETE method, no /units|/equipment DELETE). Soft-delete only; records retained.
import { readFileSync } from "node:fs";

const FILE = "apps/frontend/src/components/FleetTable.tsx";
const failures = [];

let src = "";
try {
  src = readFileSync(FILE, "utf8");
} catch {
  failures.push(`${FILE}: missing`);
}

if (src) {
  if (!/\/deactivate/.test(src)) {
    failures.push(`${FILE}: bulk inactivate must call the /deactivate (soft-delete) endpoint`);
  }
  // No hard-delete anywhere in the fleet table bulk path.
  if (/method:\s*["']DELETE["']/.test(src)) {
    failures.push(`${FILE}: hard DELETE method found — fleet inactivate must be soft-delete (deactivated_at)`);
  }
  // The inactivate mutation must be present and reuse the existing endpoints (no new bulk route).
  if (!/inactivateMutation/.test(src)) {
    failures.push(`${FILE}: inactivateMutation (bulk soft-delete) removed`);
  }
  // Reactivate must clear deactivated_at via PATCH (reversible) — never a hard op.
  if (!/reactivateMutation/.test(src)) {
    failures.push(`${FILE}: reactivateMutation (bulk reactivate) removed`);
  }
  if (!/deactivated_at:\s*null/.test(src)) {
    failures.push(`${FILE}: reactivate must clear deactivated_at via PATCH (deactivated_at: null)`);
  }
}

if (failures.length) {
  console.error("verify:fleet-bulk-soft-delete — FAIL");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log("verify:fleet-bulk-soft-delete — OK (bulk inactivate is soft-delete via /deactivate, no hard delete)");
