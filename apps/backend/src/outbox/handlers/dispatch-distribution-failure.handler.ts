/**
 * DISPATCH DISTRIBUTION FAILURE — the alarm nobody could hear.
 *
 * `dispatch.wf064.distribution_failure` is emitted by DispatchLoadDispatchedHandler after
 * distributeLoadInstructions() has failed all three attempts. It means a load was dispatched and the
 * driver was NEVER given their instructions — no PWA notification, no WhatsApp, no PDF. In a trucking
 * operation that is not a background job failing; it is a truck about to run a load blind.
 *
 * Until now the event had no consumer AND was written to outbox.outbox_queue, which nothing reads, so
 * the retry-exhausted path recorded an audit row and then went silent. Dispatch would believe the
 * driver was notified.
 *
 * WHAT THIS DELIVERS, AND WHAT IT HONESTLY DOES NOT. It writes a critical in-app notification to every
 * active Owner and Dispatcher — the people who can pick up a phone and call the driver. It does NOT
 * send email or SMS: the very subsystem that just failed is the outbound messaging path, so claiming
 * delivery through it would repeat the silent-success this fixes.
 *
 * FAILS LOUD ON ZERO RECIPIENTS. If no active Owner or Dispatcher resolves, this THROWS rather than
 * returning success. "Nobody was told a driver never got their load" must surface as a failed outbox
 * event, not be swallowed into a green delivery.
 */
import { createNotification } from "../../notifications/notification.service.js";
// Types come from the LEAF types module, never from ./registry.js: registry imports every
// handler, so importing types back from it puts this file inside a 16-file import cycle.
import type { OutboxEventHandler, OutboxHandlerContext, OutboxHandlerResult, OutboxPayload } from "./outbox-handler.types.js";

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export class DispatchDistributionFailureHandler implements OutboxEventHandler {
  eventType = "dispatch.wf064.distribution_failure" as const;

  canHandle() {
    return true;
  }

  async deliver(payload: OutboxPayload, ctx: OutboxHandlerContext): Promise<OutboxHandlerResult> {
    const operatingCompanyId = asText(payload.operating_company_id);
    const loadId = asText(payload.load_id);
    if (!operatingCompanyId) throw new Error("distribution_failure_missing_operating_company_id");
    if (!loadId) throw new Error("distribution_failure_missing_load_id");

    const reason = asText(payload.reason) ?? "(no reason recorded)";
    const attempts = Number.isFinite(Number(payload.attempts)) ? Number(payload.attempts) : null;

    // Outbox handlers run outside a user session; mdata RLS policies need a bypass or user identity,
    // not app.operating_company_id alone. Establish tenant + bypass context before any scoped read.
    await ctx.client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    await ctx.client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);

    // Resolve the load number so the alert names the load a human recognises, not a UUID. Best-effort:
    // a failure to read it must not suppress the alarm itself.
    const loadRes = await ctx.client
      .query<{ load_number: string | null }>(
        `SELECT load_number FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
        [loadId, operatingCompanyId]
      )
      .catch(() => ({ rows: [] as { load_number: string | null }[] }));
    const loadNumber = loadRes.rows[0]?.load_number ?? null;

    // Owner AND Dispatcher: the Owner owns the risk, the Dispatcher is who actually calls the driver.
    const recipients = await ctx.client.query<{ id: string }>(
      `SELECT DISTINCT u.id::text AS id
         FROM identity.users u
         LEFT JOIN org.user_company_access uca
           ON uca.user_id = u.id
          AND uca.company_id = $1::uuid
          AND uca.deactivated_at IS NULL
        WHERE u.role::text IN ('Owner', 'Dispatcher')
          AND u.deactivated_at IS NULL
          AND (u.default_company_id = $1::uuid OR uca.user_id IS NOT NULL)`,
      [operatingCompanyId]
    );
    if (recipients.rows.length === 0) {
      throw new Error("distribution_failure_no_active_recipient");
    }

    const label = loadNumber ? `Load ${loadNumber}` : `Load ${loadId}`;
    const body =
      `${label} was dispatched but the driver instructions could NOT be delivered` +
      `${attempts ? ` after ${attempts} attempts` : ""}. ` +
      `The driver has not received their PDF, PWA notification or WhatsApp message — contact them directly. ` +
      `Reason: ${reason}`;

    let delivered = 0;
    for (const recipient of recipients.rows) {
      const notification = await createNotification(
        {
          operating_company_id: operatingCompanyId,
          user_id: recipient.id,
          type: "system",
          severity: "critical",
          title: `Driver NOT notified — ${label}`,
          body,
          action_link: `/dispatch?load_id=${loadId}`,
          entity_type: "dispatch.load",
          entity_id: loadId,
          source_block: "WF-064-DISTRIBUTION-FAILURE",
        },
        ctx.client
      );
      if (!notification?.id) {
        throw new Error(`distribution_failure_notification_insert_returned_no_identity:${recipient.id}`);
      }
      delivered += 1;
    }

    ctx.log("dispatch distribution failure alerted", {
      eventId: ctx.eventId,
      loadId,
      recipients: delivered,
    });
    return { message: `distribution_failure_alerted_${delivered}_recipient(s)` };
  }
}
