#!/usr/bin/env node
/**
 * FAIL-U1 ratchet — the dispatch repair-blocker must name the work order and the truck,
 * not their uuids.
 *
 * Why: this banner is a SAFETY interlock. It is the message a dispatcher reads before deciding
 * whether to override and put a driver on a load whose truck is in the shop. Rendering
 * `WO: ad7c6b47-68fb-4d4d-a533-161110630348 · Asset: 395352db-…` tells them nothing they can act
 * on — they cannot look up that WO or walk to that truck. Same class as bills-Vendor, complaints
 * COMPLAINANT/RESPONDENT and the deduction-policy card title (WIRE-QUEUE raw-uuid class).
 *
 * Asserts the service selects the labels and the panel prefers them.
 */
import { readFileSync } from "node:fs";

const SVC = "apps/backend/src/dispatch/driver-availability.service.ts";
const UI = "apps/frontend/src/pages/dispatch/LoadCreateModal.tsx";
const fail = [];

const svc = readFileSync(SVC, "utf8");
if (!/wo\.display_id/.test(svc)) fail.push(`${SVC}: query does not select wo.display_id`);
if (!/JOIN\s+mdata\.units/i.test(svc)) fail.push(`${SVC}: query does not join mdata.units for unit_number`);
if (!/work_order_display_id:/.test(svc)) fail.push(`${SVC}: response omits work_order_display_id`);
if (!/asset_label:/.test(svc)) fail.push(`${SVC}: response omits asset_label`);
if (/blocker:\s*`Driver's truck is in repair \(WO \$\{activeWo\.id\}\)`/.test(svc))
  fail.push(`${SVC}: blocker text still interpolates the raw uuid instead of the display id`);
if (/activeWo\.display_id\s*\|\|\s*activeWo\.id/.test(svc) || /activeWo\.unit_number\s*\|\|\s*activeWo\.asset_id/.test(svc)) {
  fail.push(`${SVC}: operator labels must never fall back to canonical UUIDs`);
}
// Quick-assign HOS parity with Book — canAssignLoadToDriver must refuse HOS violators, not only repair WO.
if (!/is_in_violation/.test(svc) || !/E_DRIVER_HOS_VIOLATION/.test(svc)) {
  fail.push(`${SVC}: must check drivers_with_hos_status.is_in_violation and return E_DRIVER_HOS_VIOLATION`);
}
const route = readFileSync("apps/backend/src/dispatch/load-assign.routes.ts", "utf8");
if (!/E_DRIVER_HOS_VIOLATION/.test(route)) {
  fail.push("apps/backend/src/dispatch/load-assign.routes.ts: quick-assign must surface E_DRIVER_HOS_VIOLATION with message");
}

const ui = readFileSync(UI, "utf8");
if (!/kind="work_order"[\s\S]*?name=\{availabilityQuery\.data\?\.work_order_display_id\}[\s\S]*?noun="Work order"/.test(ui)) {
  fail.push(`${UI}: work order must use a label-aware tombstone`);
}
if (!/kind="unit"[\s\S]*?name=\{availabilityQuery\.data\?\.asset_label\}[\s\S]*?noun="Unit"/.test(ui)) {
  fail.push(`${UI}: unit must use a label-aware tombstone`);
}
if (!/submitBlocked\s*=\s*availabilityQuery\.isError\s*\|\|/.test(ui)) {
  fail.push(`${UI}: availability query failure must block submit`);
}
if (!/userFacingApiError\(availabilityQuery\.error, "Could not verify driver repair availability"\)/.test(ui)) {
  fail.push(`${UI}: availability query failure must use operator-safe copy`);
}
if (!/onRetry=\{\(\) => void availabilityQuery\.refetch\(\)\}/.test(ui)) {
  fail.push(`${UI}: availability query failure must be retryable`);
}

const board = readFileSync("apps/frontend/src/pages/dispatch/DispatchBoard.tsx", "utf8");
// C-08: quick-assign toast must prefer human message/blocker over bare E_* code.
if (!/userFacingApiError\(error, "Quick assign failed"\)/.test(board)) {
  fail.push("apps/frontend/src/pages/dispatch/DispatchBoard.tsx: quick-assign toast must use operator-safe API error formatting");
}
if (/pushToast\(\s*String\(\s*data\.error/.test(board)) {
  fail.push("apps/frontend/src/pages/dispatch/DispatchBoard.tsx: must not toast data.error first");
}

if (fail.length) {
  console.error("FAIL verify-dispatch-blocker-labels:");
  for (const f of fail) console.error("  - " + f);
  console.error("\n  A safety interlock a dispatcher cannot read is not an interlock.");
  process.exit(1);
}
console.log("PASS verify-dispatch-blocker-labels — repair blocker names the WO and the truck");
