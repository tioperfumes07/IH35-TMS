/**
 * CASH-ADVANCE-OWNER-NOTIFICATION-FAILURE-RETURNS-SUCCESS
 *
 * The owner alert for a submitted cash advance used to be a fire-and-forget call
 * (`void notifyOwnersCashAdvanceSubmitted(...).catch(() => undefined)`) made AFTER the request's
 * own transaction had already committed, in `cash-advance-requests.routes.ts`. dispatchNotification()
 * converts every real failure (DB error, disabled channel, etc.) into a resolved `{ ok: false }` —
 * it never rejects under normal operation — so the caller's `.catch()` never fired, the resolved
 * `{ ok: false }` results were discarded by `Promise.all(...)` without being read, and the request
 * still reported HTTP 201 success to the driver with no durable retry for the owner side.
 *
 * Fixed by moving delivery onto the canonical outbox: `createCashAdvanceRequest` /
 * `createOfficeCashAdvanceRequest` (driver-finance/cash-advance-requests.service.ts) already
 * enqueue `driver_finance.cash_advance_request.submitted` inside the SAME request transaction via
 * `enqueueDriverFinanceOutbox` — that event previously had no real consumer (a generic
 * TrailEventHandler that only logs an acknowledgment). This handler now OWNS that event type and
 * does the actual owner delivery, with `requiresDelivery: true` so a zero-recipient company or any
 * dispatch failure throws — the outbox processor's own retry/backoff schedules a retry and the
 * event stays visibly un-delivered until it truly succeeds, instead of a route silently discarding
 * the outcome. No new GL/money math — reuses dispatchNotification and listCompanyUserIdsByRoles
 * verbatim.
 */
import { dispatchNotification, listCompanyUserIdsByRoles } from "../../notifications/dispatcher.js";
import type { OutboxEventHandler, OutboxHandlerContext, OutboxHandlerResult, OutboxPayload } from "./outbox-handler.types.js";

function requiredText(payload: OutboxPayload, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`cash_advance_owner_notification_missing_${key}`);
  return value.trim();
}

export class CashAdvanceOwnerNotificationHandler implements OutboxEventHandler {
  eventType = "driver_finance.cash_advance_request.submitted" as const;
  requiresDelivery = true as const;

  canHandle() {
    return true;
  }

  async deliver(payload: OutboxPayload, ctx: OutboxHandlerContext): Promise<OutboxHandlerResult> {
    const operatingCompanyId = requiredText(payload, "operating_company_id");
    const requestId = requiredText(payload, "request_id");
    const displayId = requiredText(payload, "display_id");
    const actorUserId = typeof payload.actor_user_id === "string" ? payload.actor_user_id : null;
    const cents = Number(payload.requested_amount_cents ?? 0);
    const amountLabel = `USD ${(cents / 100).toFixed(2)}`;
    const headline = `Cash advance request ${displayId}`;
    const bodyText = `A driver submitted cash advance ${displayId} for ${amountLabel}.`;

    const owners = await listCompanyUserIdsByRoles(operatingCompanyId, ["Owner"]);
    if (owners.length === 0) {
      // Fail-loud zero-recipient: a company with no Owner user means this alert can never be
      // delivered as-is. Throwing (instead of a quiet "delivered" no-op) keeps the event visibly
      // stuck and retryable rather than reporting success for an alert nobody received.
      throw new Error(`cash_advance_owner_notification_zero_recipients:${operatingCompanyId}`);
    }

    const results = await Promise.all(
      owners.map((userId) =>
        dispatchNotification({
          user_id: userId,
          event_type: "advance.created",
          actor_user_id: actorUserId,
          payload: {
            operating_company_id: operatingCompanyId,
            request_id: requestId,
            headline,
            bodyText,
            sms_body: `${headline} (${amountLabel}).`,
            whatsapp_skip: true,
          },
        })
      )
    );

    const failed = results.filter((r) => !r.ok);
    if (failed.length > 0) {
      // Partial or total delivery failure — surface it as a real failure so the retry/backoff
      // schedule actually re-attempts, instead of the previous discard-and-report-201 behavior.
      throw new Error(
        `cash_advance_owner_notification_delivery_failed:${failed.length}/${owners.length}:${failed
          .map((r) => r.error ?? "unknown")
          .join(",")}`
      );
    }

    ctx.log("cash advance owner notification delivered", { eventId: ctx.eventId, requestId, ownerCount: owners.length });
    return { message: "cash_advance_owner_notification_dispatched" };
  }
}
