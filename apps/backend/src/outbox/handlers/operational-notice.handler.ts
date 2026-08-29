/**
 * OPERATIONAL NOTICE HANDLER — one factory, one behaviour, seven registered consumers.
 *
 * Turns each entry in NOTICE_ROUTES into a registered OutboxEventHandler. See
 * operational-notice.routes.ts for why this is a table rather than seven hand-written classes.
 *
 * INVARIANTS THIS ENFORCES FOR EVERY ROUTE:
 *  - FAILS LOUD ON ZERO RECIPIENTS. If nobody can be resolved, it THROWS. A notification delivered to
 *    an empty audience is the silent success this entire effort exists to remove; a failed outbox row
 *    is visible, a green one to nobody is not.
 *  - NEVER SILENTLY DOWNGRADES A DRIVER NOTICE. Only 6 of 183 drivers carry an identity_user_id, so a
 *    driver-targeted notice usually cannot reach the driver. Rather than succeed against nothing, it
 *    notifies the fallback audience and says explicitly that the driver was NOT reachable in-app —
 *    turning a hidden data gap into an actionable one.
 *  - ENTITY-SCOPED. operating_company_id is required and is written on every notification, so a notice
 *    cannot leak across TRANSP / TRK / USMCA.
 */
import { createNotification } from "../../notifications/notification.service.js";
import { dispatchNotification } from "../../notifications/dispatcher.js";
import type { NoticePayload, NoticeRoute } from "./operational-notice.routes.js";
import { NOTICE_ROUTES } from "./operational-notice.routes.js";
// Types come from the LEAF types module, never from ./registry.js: registry imports every
// handler, so importing types back from it puts this file inside a 16-file import cycle.
import type { OutboxEventHandler, OutboxHandlerContext, OutboxHandlerResult, OutboxPayload } from "./outbox-handler.types.js";

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

type Recipients = { userIds: string[]; driverUnreachable: boolean };

async function resolveByRoles(
  ctx: OutboxHandlerContext,
  operatingCompanyId: string,
  roles: string[],
): Promise<string[]> {
  const res = await ctx.client.query<{ id: string }>(
    `SELECT DISTINCT u.id::text AS id
       FROM identity.users u
       LEFT JOIN org.user_company_access uca
         ON uca.user_id = u.id
        AND uca.company_id = $1::uuid
        AND uca.deactivated_at IS NULL
      WHERE u.role::text = ANY($2::text[])
        AND u.deactivated_at IS NULL
        AND (
          u.default_company_id = $1::uuid
          OR uca.user_id IS NOT NULL
        )`,
    [operatingCompanyId, roles]
  );
  return res.rows.map((r) => r.id);
}

async function resolveRecipients(
  route: NoticeRoute,
  payload: NoticePayload,
  ctx: OutboxHandlerContext
): Promise<Recipients> {
  const operatingCompanyId = asText(payload.operating_company_id);
  if (!operatingCompanyId) {
    throw new Error(`${route.eventType}_missing_operating_company_id`);
  }
  if (route.audience.kind === "roles") {
    return {
      userIds: await resolveByRoles(ctx, operatingCompanyId, route.audience.roles),
      driverUnreachable: false,
    };
  }

  const driverId = asText(payload[route.audience.driverIdKey]);
  if (driverId) {
    // ENTITY-SCOPED: the driver must belong to the company the event was raised for. Resolving a
    // driver by bare id would let a TRANSP event address a USMCA driver's login.
    const res = await ctx.client.query<{ identity_user_id: string | null }>(
      `SELECT identity_user_id::text AS identity_user_id
         FROM mdata.drivers
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
          AND deactivated_at IS NULL
          AND archived_at IS NULL
        LIMIT 1`,
      [driverId, asText(payload.operating_company_id)]
    );
    const userId = res.rows[0]?.identity_user_id ?? null;
    if (userId) return { userIds: [userId], driverUnreachable: false };
  }

  // No driver login — tell the humans who can reach them another way, and say so.
  return {
    userIds: await resolveByRoles(ctx, operatingCompanyId, route.audience.fallbackRoles),
    driverUnreachable: true,
  };
}

export function createOperationalNoticeHandler(route: NoticeRoute): OutboxEventHandler {
  return new (class implements OutboxEventHandler {
    eventType = route.eventType;

    canHandle() {
      return true;
    }

    async deliver(payload: OutboxPayload, ctx: OutboxHandlerContext): Promise<OutboxHandlerResult> {
      const p = payload as NoticePayload;
      const operatingCompanyId = asText(p.operating_company_id);
      if (!operatingCompanyId) {
        throw new Error(`${route.eventType}_missing_operating_company_id`);
      }

      // Outbox handlers run outside a user session; mdata RLS policies need a bypass or user identity,
      // not app.operating_company_id alone. Establish tenant + bypass context before any scoped read.
      await ctx.client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
      await ctx.client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);

      const { userIds, driverUnreachable } = await resolveRecipients(route, p, ctx);
      if (userIds.length === 0) {
        throw new Error(`${route.eventType}_no_recipient_resolved`);
      }

      const body = driverUnreachable
        ? `${route.body(p)} (The driver has no app login, so they could NOT be notified in-app — ` +
          `reach them directly.)`
        : route.body(p);

      let delivered = 0;
      for (const userId of userIds) {
        await createNotification(
          {
            operating_company_id: operatingCompanyId,
            user_id: userId,
            type: "system",
            severity: route.severity,
            title: route.title(p),
            body,
            action_link: route.actionLink(p),
            entity_type: route.entityType,
            entity_id: asText(p[route.entityIdKey]),
            source_block: route.sourceBlock,
          },
          ctx.client
        );
        delivered += 1;
      }

      if (route.multiChannelRoles?.length) {
        const channelRecipients = await resolveByRoles(ctx, operatingCompanyId, route.multiChannelRoles);
        if (channelRecipients.length === 0) {
          throw new Error(`${route.eventType}_no_multichannel_recipient_resolved`);
        }
        const headline = route.title(p);
        const bodyText = route.body(p);
        const results = await Promise.all(
          channelRecipients.map((userId) =>
            dispatchNotification({
              user_id: userId,
              event_type: "abandoned_load",
              actor_user_id: asText(p.actor_user_id),
              payload: {
                ...p,
                operating_company_id: operatingCompanyId,
                headline,
                bodyText,
              },
            }),
          ),
        );
        const failures = results.filter((result) => !result.ok);
        if (failures.length) {
          throw new Error(
            `${route.eventType}_multichannel_delivery_failed:${failures.length}/${channelRecipients.length}`,
          );
        }
      }

      ctx.log("operational notice delivered", {
        eventId: ctx.eventId,
        eventType: route.eventType,
        recipients: delivered,
        driverUnreachable,
      });
      return {
        message: `${route.eventType}_delivered_to_${delivered}${driverUnreachable ? "_via_fallback" : ""}`,
      };
    }
  })();
}

/** Every operational-notice handler, ready to register. */
export function operationalNoticeHandlers(): OutboxEventHandler[] {
  return NOTICE_ROUTES.map(createOperationalNoticeHandler);
}
