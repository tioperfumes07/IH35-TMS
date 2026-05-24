import type { PoolClient } from "pg";
import { TwilioSmsHandler } from "./twilio-sms.js";
import { TwilioWhatsappHandler } from "./twilio-whatsapp.js";
import { DispatchLoadDispatchedHandler } from "./dispatch-load-dispatched.handler.js";
import { QboMasterEntityPushHandler } from "./qbo-master-entity-push.handler.js";
import { TmsCustomerPushHandler } from "./tms-customer-push.handler.js";
import { TmsVendorPushHandler } from "./tms-vendor-push.handler.js";
import { TmsItemPushHandler } from "./tms-item-push.handler.js";
import { TmsAccountPushHandler } from "./tms-account-push.handler.js";
import { TmsInvoicePushHandler } from "./tms-invoice-push.handler.js";
import { TmsBillPushHandler } from "./tms-bill-push.handler.js";
import { buildTrailEventHandlers } from "./trail-events.handler.js";

export type OutboxPayload = Record<string, unknown>;

export type OutboxHandlerContext = {
  client: PoolClient;
  eventId: string;
  instanceId: string;
  log: (message: string, meta?: Record<string, unknown>) => void;
};

export type OutboxHandlerResult = {
  message?: string;
};

export interface OutboxEventHandler {
  eventType: string;
  canHandle: () => boolean;
  deliver: (payload: OutboxPayload, ctx: OutboxHandlerContext) => Promise<OutboxHandlerResult | void>;
}

class TestNoopHandler implements OutboxEventHandler {
  eventType = "test.noop" as const;

  canHandle() {
    return true;
  }

  async deliver(payload: OutboxPayload, ctx: OutboxHandlerContext) {
    ctx.log("outbox test.noop delivered", { eventId: ctx.eventId, payload });
    return { message: "noop_ok" };
  }
}

class AuditPersistHandler implements OutboxEventHandler {
  eventType = "audit.event.persist" as const;

  canHandle() {
    return true;
  }

  async deliver(payload: OutboxPayload, ctx: OutboxHandlerContext) {
    const eventClass = typeof payload.event_class === "string" ? payload.event_class.trim() : "";
    const severityRaw = typeof payload.severity === "string" ? payload.severity.trim() : "info";
    const source = typeof payload.source === "string" ? payload.source : "BT-2-OUTBOX-PROCESSOR";
    const actor = typeof payload.actor_user_uuid === "string" ? payload.actor_user_uuid : null;
    const eventPayload =
      payload.payload && typeof payload.payload === "object" && !Array.isArray(payload.payload)
        ? (payload.payload as Record<string, unknown>)
        : payload;

    if (!eventClass) throw new Error("audit_event_missing_event_class");
    if (!["info", "warning", "critical"].includes(severityRaw)) {
      throw new Error("audit_event_invalid_severity");
    }

    await ctx.client.query(`SELECT audit.append_event($1, $2, $3::jsonb, $4::uuid, $5)`, [
      eventClass,
      severityRaw,
      JSON.stringify(eventPayload),
      actor,
      source,
    ]);
    return { message: "audit_event_persisted" };
  }
}

class GeofenceBreachDetectedHandler implements OutboxEventHandler {
  eventType = "geofence_breach_detected" as const;

  canHandle() {
    return true;
  }

  async deliver(payload: OutboxPayload, ctx: OutboxHandlerContext) {
    ctx.log("outbox geofence_breach_detected delivered", { eventId: ctx.eventId, payload });
    return { message: "geofence_breach_detected_logged" };
  }
}

export function buildOutboxHandlerRegistry() {
  const handlers: OutboxEventHandler[] = [
    new TwilioSmsHandler(),
    new TwilioWhatsappHandler(),
    new DispatchLoadDispatchedHandler(),
    new QboMasterEntityPushHandler(),
    new TmsCustomerPushHandler(),
    new TmsVendorPushHandler(),
    new TmsItemPushHandler(),
    new TmsAccountPushHandler(),
    new TmsInvoicePushHandler(),
    new TmsBillPushHandler(),
    new GeofenceBreachDetectedHandler(),
    new AuditPersistHandler(),
    new TestNoopHandler(),
    ...buildTrailEventHandlers(),
  ];
  return new Map(handlers.map((handler) => [handler.eventType, handler]));
}
