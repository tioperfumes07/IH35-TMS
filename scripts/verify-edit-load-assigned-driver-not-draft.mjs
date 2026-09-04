#!/usr/bin/env node
// GUARD — WIZ-STATUS-01 (owner block 2026-09-04, load 13508).
//
// Defect (proven live): load 13508 sat at status='draft' while carrying an assigned primary driver,
// an OPEN driver bill (13508), and a proforma customer invoice (13508). A money-bearing, crewed load
// can never be a draft. The Edit Load PATCH path intentionally excludes status, so assigning a driver
// left the load at 'draft'.
//
// Fix: update-load.service must advance a load that ends the edit with a committed driver/team from
// 'draft' -> 'assigned_not_dispatched' (never 'dispatched' — dispatch is its own action), gated to
// draft only so non-draft loads (post-delivery edits, etc.) are untouched.
//
// This guard fails if that advance is dropped or made unconditional.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "apps/backend/src/dispatch/update-load.service.ts"), "utf8");

const failures = [];
const check = (cond, msg) => {
  if (!cond) failures.push(msg);
};

check(
  /String\(old\.status[^)]*\)\s*===\s*"draft"/.test(src),
  "update-load.service must gate the status advance on the load currently being a 'draft'."
);
check(
  /effectivePrimaryDriver\s*\|\|\s*effectiveTeam/.test(src),
  "update-load.service must advance only when the edit ends with a committed driver or team."
);
check(
  /add\("status",\s*"assigned_not_dispatched"/.test(src),
  "update-load.service must advance a crewed draft load to 'assigned_not_dispatched'."
);
check(
  /assigned_not_dispatched"[^\n]*::mdata\.load_status_enum/.test(src),
  "the status advance must cast to ::mdata.load_status_enum."
);
// Never claim 'dispatched' from the edit path (owner has not dispatched; dispatch is its own action).
check(
  !/add\("status",\s*"dispatched"/.test(src),
  "FORBIDDEN: the edit PATCH must not set status='dispatched' — dispatch is its own action."
);

if (failures.length) {
  console.error("verify-edit-load-assigned-driver-not-draft: FAIL");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log("verify-edit-load-assigned-driver-not-draft: PASS");
