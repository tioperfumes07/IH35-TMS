/**
 * WF-064 OVERRIDE NOTICE — the consumer that never existed.
 *
 * THE DEFECT (found 2026-08-02): `dispatch.wf064.override_notice` is PRODUCED in three places in
 * book-load.service.ts — the unit dispatch-block override, the OOS override, and the driver-
 * qualification (CDL / DOT-medical) override — and was CONSUMED NOWHERE.
 *
 * CORRECTION 2026-08-03, measured on prod (positive control mdata.vendors = 2,828). This header
 * previously said the notices had been "PERMANENTLY FAILING" because processor.ts calls markFailedNow()
 * for an unregistered event_type. That was WRONG, and the real cause was worse. This handler IS
 * registered (handlers/registry.ts) and the processor is healthy — outbox.events holds 31,622 rows with
 * 31,618 delivered and 0 undelivered. The producers were writing to a DIFFERENT table,
 * outbox.outbox_queue, which nothing in the backend reads: 49 rows, every one still PENDING with
 * attempts = 0, the oldest from 2026-06-16. Nothing failed, because nothing was ever attempted.
 * Fixed by routing the three producers through enqueueOverrideNotice() onto outbox.events, guarded by
 * scripts/verify-outbox-canonical-table.mjs.
 *
 * That is the worst shape a control can take. An Owner pushing a dispatch past a federal
 * driver-qualification stop is exactly the event another Owner, an insurer or a DOT reviewer would
 * expect to be announced — and the announcement silently died.
 *
 * WHAT THIS DELIVERS, AND WHAT IT HONESTLY DOES NOT. It writes an in-app notification to every active
 * Owner via notifications.user_notifications — the surface owners actually see. It does NOT send email
 * or SMS. The payload's `notify_channels` is aspirational and is left untouched so a later channel
 * handler can consume the same field; claiming email delivery here without wiring a provider would
 * re-create the exact silent-success this fixes.
 *
 * FAILS LOUD ON ZERO RECIPIENTS. If no active Owner can be resolved, this THROWS rather than returning
 * success. "Nobody was notified that a DOT stop was overridden" is a real failure and must surface as
 * a failed outbox event, not be swallowed into a green delivery.
 *
 * One handler serves all three override types because the three producers write an identical payload
 * shape (override_type / override_class / override_reason / override_by_user_id / operating_company_id
 * / load_context).
 */
import { createNotification } from "../../notifications/notification.service.js";
import type { OutboxEventHandler, OutboxHandlerContext, OutboxPayload } from "./outbox-handler.types.js";

function asText(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Human label for the blocker class that was overridden. */
function describeOverride(payload: OutboxPayload): string {
  const cls = asText(payload.override_class);
  const type = asText(payload.override_type);
  if (cls === "DOT_QUALIFICATION") return "driver qualification (CDL / DOT medical)";
  if (type === "unit_block") return "unit dispatch block";
  if (type === "oos") return "out-of-service unit";
  return type ?? cls ?? "dispatch blocker";
}

export class DispatchOverrideNoticeHandler implements OutboxEventHandler {
  eventType = "dispatch.wf064.override_notice" as const;

  canHandle() {
    return true;
  }

  async deliver(payload: OutboxPayload, ctx: OutboxHandlerContext) {
    const operatingCompanyId = asText(payload.operating_company_id);
    if (!operatingCompanyId) throw new Error("override_notice_missing_operating_company_id");

    const reason = asText(payload.override_reason) ?? "(no reason recorded)";
    const overriddenBy = asText(payload.override_by_user_id);
    const what = describeOverride(payload);

    const reasons = Array.isArray(payload.overridden_reasons)
      ? (payload.overridden_reasons as unknown[]).map((r) => String(r)).join(", ")
      : null;

    const loadCtx =
      payload.load_context && typeof payload.load_context === "object"
        ? (payload.load_context as Record<string, unknown>)
        : {};
    const loadNumber = asText(loadCtx.load_number);
    const lane = [asText(loadCtx.lane_origin), asText(loadCtx.lane_destination)].filter(Boolean).join(" → ");

    // Owner is a global role on identity.users (no per-company membership column). Every ACTIVE Owner
    // is notified — an override of a safety gate is not a single-owner concern.
    const owners = await ctx.client.query<{ id: string }>(
      `SELECT id::text AS id FROM identity.users WHERE role = 'Owner' AND deactivated_at IS NULL`
    );
    if (owners.rows.length === 0) {
      throw new Error("override_notice_no_active_owner_recipient");
    }

    const bodyParts = [
      `Blocker overridden: ${what}.`,
      reasons ? `Specific reasons: ${reasons}.` : null,
      loadNumber || lane ? `Load: ${[loadNumber, lane].filter(Boolean).join(" · ")}.` : null,
      `Reason given: ${reason}`,
    ].filter(Boolean);

    let delivered = 0;
    for (const owner of owners.rows) {
      await createNotification(
        {
          operating_company_id: operatingCompanyId,
          user_id: owner.id,
          type: "system",
          severity: "critical",
          title: `Owner override — ${what}`,
          body: bodyParts.join(" "),
          action_link: "/dispatch/owner-override-log",
          entity_type: "dispatch.override",
          entity_id: overriddenBy,
          source_block: "WF-064-OVERRIDE-NOTICE",
        },
        ctx.client
      );
      delivered += 1;
    }

    ctx.log("wf064 override notice delivered", {
      eventId: ctx.eventId,
      override_class: asText(payload.override_class),
      recipients: delivered,
    });
    return { message: `override_notice_delivered_to_${delivered}_owner(s)` };
  }
}
