#!/usr/bin/env node
/**
 * verify-cash-advance-owner-notification-durable.mjs
 *
 * CASH-ADVANCE-OWNER-NOTIFICATION-FAILURE-RETURNS-SUCCESS — dispatchNotification() converts
 * database/channel failures into a resolved { ok: false }, but the old caller
 * (notifyOwnersCashAdvanceSubmitted, invoked fire-and-forget as
 * `void ...catch(() => undefined)` from the submit route) only caught rejected promises and
 * discarded every resolved result — a cash-advance request could commit while every owner
 * notification failed and the route still reported HTTP 201 success with no durable retry.
 *
 * Fixed by moving delivery onto the canonical outbox event
 * (driver_finance.cash_advance_request.submitted, already enqueued in the SAME request
 * transaction) via a new CashAdvanceOwnerNotificationHandler with requiresDelivery=true.
 * Behavior (success / partial-failure-throws / zero-recipient-throws) is unit-tested in
 * outbox/handlers/__tests__/cash-advance-owner-notification.handler.test.ts — this guard covers
 * the WIRING: the handler is registered, the generic trail handler no longer shadows it, the old
 * fire-and-forget call site is gone, and both enqueue sites carry the fields the handler needs.
 */
import { readFileSync } from "node:fs";

const failures = [];

const registrySrc = readFileSync("apps/backend/src/outbox/handlers/registry.ts", "utf8");
if (!/import \{ CashAdvanceOwnerNotificationHandler \} from "\.\/cash-advance-owner-notification\.handler\.js"/.test(registrySrc)) {
  failures.push("outbox/handlers/registry.ts: no longer imports CashAdvanceOwnerNotificationHandler");
}
if (!/new CashAdvanceOwnerNotificationHandler\(\)/.test(registrySrc)) {
  failures.push("outbox/handlers/registry.ts: no longer registers CashAdvanceOwnerNotificationHandler in the handler array");
}

const trailSrc = readFileSync("apps/backend/src/outbox/handlers/trail-events.handler.ts", "utf8");
if (/new TrailEventHandler\("driver_finance\.cash_advance_request\.submitted"\)/.test(trailSrc)) {
  failures.push(
    'outbox/handlers/trail-events.handler.ts: still registers a generic TrailEventHandler for "driver_finance.cash_advance_request.submitted" — since buildTrailEventHandlers() is spread LAST into the registry array, this silently shadows CashAdvanceOwnerNotificationHandler in the Map (last write wins)'
  );
}

const routeSrc = readFileSync("apps/backend/src/driver-finance/cash-advance-requests.routes.ts", "utf8");
if (/notifyOwnersCashAdvanceSubmitted/.test(routeSrc)) {
  failures.push("driver-finance/cash-advance-requests.routes.ts: still references notifyOwnersCashAdvanceSubmitted — the fire-and-forget dispatch must be fully removed, not re-wrapped");
}

const serviceSrc = readFileSync("apps/backend/src/driver-finance/cash-advance-requests.service.ts", "utf8");
const submittedEnqueueCount = (serviceSrc.match(/enqueueDriverFinanceOutbox\(client, "driver_finance\.cash_advance_request\.submitted"/g) ?? []).length;
const amountFieldCount = (serviceSrc.match(/requested_amount_cents: input\.requested_amount_cents,\s*(?:\n\s*)?actor_user_id: args\.actorUserId/g) ?? []).length;
if (submittedEnqueueCount < 2) {
  failures.push(`driver-finance/cash-advance-requests.service.ts: expected 2 "submitted" enqueue call sites (driver-initiated + office-initiated); found ${submittedEnqueueCount}`);
}
if (amountFieldCount < submittedEnqueueCount) {
  failures.push(
    `driver-finance/cash-advance-requests.service.ts: expected every "submitted" enqueue call site to carry requested_amount_cents + actor_user_id for the handler; found ${amountFieldCount}/${submittedEnqueueCount}`
  );
}

const dispatcherSrc = readFileSync("apps/backend/src/notifications/dispatcher.ts", "utf8");
if (/export async function notifyOwnersCashAdvanceSubmitted/.test(dispatcherSrc)) {
  failures.push("notifications/dispatcher.ts: notifyOwnersCashAdvanceSubmitted was not retired — its only caller is gone, keeping it around risks a future reintroduction of the same fire-and-forget bug");
}

if (failures.length > 0) {
  console.error("verify-cash-advance-owner-notification-durable: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  "verify-cash-advance-owner-notification-durable: OK — cash-advance owner alert is wired through the durable outbox handler, not a fire-and-forget dispatch"
);
