#!/usr/bin/env node
/**
 * verify-cancellation-approver-actor-and-billable-charge.mjs
 *
 * LV-CANCEL-BILLABLE-WITHOUT-CHARGE-AND-APPROVAL-WITHOUT-APPROVER — the single canonical writer of
 * dispatch.load_cancellations (writeLoadCancellationRecord, cancellation.service.ts) wrote
 * status='approved' at create time (both from cancelLoad, when no owner-approval was needed or an
 * Owner cancels directly; and from the Kanban drop-status fallback in loads.routes.ts, which is
 * always approved) without ever stamping approved_by_user_id/approved_at — only the separate
 * two-step approveCancellation() flow recorded an approver. Live prod (Neon project
 * tiny-field-89581227) confirmed 0 rows exist yet, so this was a real code defect with zero live
 * blast radius so far, not yet an incident — fixed before the first real cancellation could hit it.
 *
 * Also: cancellation_charge_cents had no validation forcing it non-null when billable_to_customer is
 * true, at either the backend (cancelLoad) or the frontend (CancelLoadModal.tsx) — a cancellation
 * could be marked billable with the charge amount silently lost.
 *
 * Guards:
 *  1. writeLoadCancellationRecord's INSERT/UPSERT writes approved_by_user_id/approved_at.
 *  2. cancelLoad rejects (before writing) a billable cancellation with no charge amount.
 *  3. cancelLoad stamps approved_by_user_id when it writes status='approved' directly (NULL only
 *     while genuinely pending a separate approval).
 *  4. loads.routes.ts's Kanban-cancel fallback (the second caller of the same canonical writer)
 *     stamps approved_by_user_id too — it always writes status='approved'.
 *  5. CancelLoadModal.tsx disables submit when billable is checked with no charge entered.
 */
import { readFileSync } from "node:fs";

const failures = [];

const servicePath = "apps/backend/src/dispatch/cancellation.service.ts";
const serviceSrc = readFileSync(servicePath, "utf8");

if (!/approved_by_user_id\s*,\s*approved_at/.test(serviceSrc)) {
  failures.push(`${servicePath}: writeLoadCancellationRecord's INSERT no longer includes approved_by_user_id/approved_at`);
}
// FAIL-CANCEL-PARAM-10: bare `$10` + NULL approved_by_user_id made Postgres raise
// "could not determine data type of parameter $10" and blocked every direct Cancel Load
// (Owner path stamps null approver). Cast keeps the CASE WHEN typed.
if (!/\$10::uuid[\s\S]{0,80}?CASE WHEN \$10::uuid IS NOT NULL THEN now\(\)/.test(serviceSrc)) {
  failures.push(
    `${servicePath}: writeLoadCancellationRecord INSERT must cast $10::uuid (FAIL-CANCEL-PARAM-10) — bare $10 fails when approved_by_user_id is NULL`,
  );
}
if (!/SET reason_code = EXCLUDED\.reason_code[\s\S]{0,600}?approved_by_user_id = EXCLUDED\.approved_by_user_id/.test(serviceSrc)) {
  failures.push(`${servicePath}: the ON CONFLICT UPDATE clause no longer updates approved_by_user_id`);
}
if (!/E_CANCELLATION_CHARGE_REQUIRED_WHEN_BILLABLE/.test(serviceSrc)) {
  failures.push(`${servicePath}: no longer rejects a billable cancellation with no charge amount`);
}
if (!/approved_by_user_id:\s*pendingOwnerApproval\s*\?\s*null\s*:\s*userId/.test(serviceSrc)) {
  failures.push(`${servicePath}: cancelLoad no longer stamps approved_by_user_id on the direct-approve path`);
}

const routesPath = "apps/backend/src/dispatch/cancellation.routes.ts";
const routesSrc = readFileSync(routesPath, "utf8");
if (!/E_CANCELLATION_CHARGE_REQUIRED_WHEN_BILLABLE/.test(routesSrc)) {
  failures.push(`${routesPath}: mapServiceError no longer maps E_CANCELLATION_CHARGE_REQUIRED_WHEN_BILLABLE to a 400`);
}

const loadsRoutesPath = "apps/backend/src/mdata/loads.routes.ts";
const loadsRoutesSrc = readFileSync(loadsRoutesPath, "utf8");
const kanbanCallMatch = loadsRoutesSrc.match(/writeLoadCancellationRecord\(client,\s*\{[\s\S]{0,1200}?\}\);/);
if (!kanbanCallMatch) {
  failures.push(`${loadsRoutesPath}: could not find the Kanban-cancel writeLoadCancellationRecord call — re-check this guard`);
} else if (!/approved_by_user_id:\s*authUser\.uuid/.test(kanbanCallMatch[0])) {
  failures.push(`${loadsRoutesPath}: the Kanban-cancel fallback no longer stamps approved_by_user_id (this path always writes status='approved')`);
}

const modalPath = "apps/frontend/src/components/dispatch/CancelLoadModal.tsx";
const modalSrc = readFileSync(modalPath, "utf8");
// The same `billable && !charge.trim()` condition also appears in the disabled-prop and the
// helper-message JSX — neither of those alone stops a form submit. Require the actual runtime
// early-return inside onSubmit specifically, not just the pattern appearing anywhere in the file.
if (!/if \(billable && !charge\.trim\(\)\) return;/.test(modalSrc)) {
  failures.push(`${modalPath}: onSubmit no longer early-returns when billable is checked with no charge entered`);
}
if (!/disabled=\{[^}]*billable\s*&&\s*!charge\.trim\(\)/.test(modalSrc)) {
  failures.push(`${modalPath}: submit Button's disabled prop no longer accounts for billable-without-charge`);
}

if (failures.length > 0) {
  console.error("verify-cancellation-approver-actor-and-billable-charge: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  // Planted regression: bare $10 must FAIL this guard (FAIL-CANCEL-PARAM-10).
  const planted = serviceSrc.replace(
    /\$10::uuid,CASE WHEN \$10::uuid IS NOT NULL THEN now\(\) ELSE NULL END/,
    "$10,CASE WHEN $10 IS NOT NULL THEN now() ELSE NULL END",
  );
  if (planted === serviceSrc) {
    console.error("verify-cancellation-approver-actor-and-billable-charge --selftest: FAIL — could not plant bare $10");
    process.exit(1);
  }
  if (/\$10::uuid[\s\S]{0,80}?CASE WHEN \$10::uuid IS NOT NULL THEN now\(\)/.test(planted)) {
    console.error("verify-cancellation-approver-actor-and-billable-charge --selftest: FAIL — planted bare $10 still matched cast assert");
    process.exit(1);
  }
  console.log("verify-cancellation-approver-actor-and-billable-charge --selftest: OK — planted bare $10 rejected");
  process.exit(0);
}

console.log(
  "verify-cancellation-approver-actor-and-billable-charge: OK — both writeLoadCancellationRecord callers stamp an approver of record on status='approved', and billable-without-charge is rejected FE+BE; FAIL-CANCEL-PARAM-10 $10::uuid cast locked",
);
