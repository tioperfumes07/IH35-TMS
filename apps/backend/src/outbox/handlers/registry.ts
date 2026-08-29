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
import { SamsaraMasterDataPushHandler } from "./samsara-master-data-push.handler.js";
import { SamsaraCreateGeofenceHandler } from "./samsara-create-geofence.handler.js";
import { FmcsaCustomerVerifyHandler } from "./fmcsa-customer-verify.handler.js";
// WF-064: dispatch.wf064.override_notice and dispatch.wf064.distribution_failure had NO consumer.
// Corrected 2026-08-03: the override notice was not "failing permanently" — it was written to
// outbox.outbox_queue, which nothing reads, so it was never attempted at all. See each handler.
import { DispatchOverrideNoticeHandler } from "./dispatch-override-notice.handler.js";
import { DispatchDistributionFailureHandler } from "./dispatch-distribution-failure.handler.js";
import { operationalNoticeHandlers } from "./operational-notice.handler.js";
import { DriverInviteEmailHandler } from "./driver-invite-email.handler.js";
import { WorkOrderApprovedHandler } from "./work-order-approved.handler.js";
import { AuthEmailVerificationHandler } from "./auth-email-verification.handler.js";
import { IdentityUserPasswordSetupHandler } from "./identity-user-password-setup.handler.js";
import { OnboardingTeamInviteHandler } from "./onboarding-team-invite.handler.js";
import { IdentityPasswordResetEmailHandler } from "./identity-password-reset-email.handler.js";
import { LegalAttorneyDecisionEmailHandler } from "./legal-attorney-decision-email.handler.js";
import { LegalContractSignEmailHandler } from "./legal-contract-sign-email.handler.js";
import { LegalContractVerificationEmailHandler } from "./legal-contract-verification-email.handler.js";
import { SafetyIncidentStakeholderNotificationHandler } from "./safety-incident-stakeholder-notification.handler.js";
import { DriverDocumentExpiryEmailHandler } from "./driver-document-expiry-email.handler.js";
import { SafetyCertExpiryCriticalNotificationHandler } from "./safety-cert-expiry-critical-notification.handler.js";
import { SafetyEventSevereNotificationHandler } from "./safety-event-severe-notification.handler.js";
import { DriverProfileMessageDeliveryHandler } from "./driver-profile-message-delivery.handler.js";
import { ShipperPortalMilestoneEmailHandler } from "./shipper-portal-milestone-email.handler.js";
import { ShipperPortalPasswordResetEmailHandler } from "./shipper-portal-password-reset-email.handler.js";
import { MaintenanceEngineFaultNotificationHandler } from "./maintenance-engine-fault-notification.handler.js";
import { ComplianceReminderEmailHandler } from "./compliance-reminder-email.handler.js";
import { CashAdvanceOwnerNotificationHandler } from "./cash-advance-owner-notification.handler.js";
import type { OutboxEventHandler, OutboxHandlerContext, OutboxPayload } from "./outbox-handler.types.js";

// Re-export leaf types so existing handler imports from ./registry.js keep working
// without pulling new handlers into the FMCSA acyclic edge.
export type {
  OutboxPayload,
  OutboxHandlerContext,
  OutboxHandlerResult,
  OutboxEventHandler,
} from "./outbox-handler.types.js";

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

export function buildUniqueOutboxHandlerMap(handlers: OutboxEventHandler[]) {
  const registry = new Map<string, OutboxEventHandler>();
  for (const handler of handlers) {
    if (registry.has(handler.eventType)) {
      throw new Error(`duplicate_outbox_handler:${handler.eventType}`);
    }
    registry.set(handler.eventType, handler);
  }
  return registry;
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
    new SamsaraMasterDataPushHandler(),
    new SamsaraCreateGeofenceHandler(),
    new FmcsaCustomerVerifyHandler(),
    new DispatchOverrideNoticeHandler(),
    new DispatchDistributionFailureHandler(),
    new GeofenceBreachDetectedHandler(),
    new AuditPersistHandler(),
    new TestNoopHandler(),
    new DriverInviteEmailHandler(),
    new WorkOrderApprovedHandler(),
    new AuthEmailVerificationHandler(),
    new IdentityUserPasswordSetupHandler(),
    new OnboardingTeamInviteHandler(),
    new IdentityPasswordResetEmailHandler(),
    new LegalAttorneyDecisionEmailHandler(),
    new LegalContractSignEmailHandler(),
    new LegalContractVerificationEmailHandler(),
    new SafetyIncidentStakeholderNotificationHandler(),
    new DriverDocumentExpiryEmailHandler(),
    new SafetyCertExpiryCriticalNotificationHandler(),
    new SafetyEventSevereNotificationHandler(),
    new DriverProfileMessageDeliveryHandler(),
    new ShipperPortalMilestoneEmailHandler(),
    new ShipperPortalPasswordResetEmailHandler(),
    new MaintenanceEngineFaultNotificationHandler(),
    new ComplianceReminderEmailHandler(),
    new CashAdvanceOwnerNotificationHandler(),
    // Seven events that were produced with no consumer at all — see operational-notice.routes.ts.
    ...operationalNoticeHandlers(),
    ...buildTrailEventHandlers(),
  ];
  return buildUniqueOutboxHandlerMap(handlers);
}
