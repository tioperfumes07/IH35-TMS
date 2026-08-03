/**
 * TWILIO CHANNEL CAPABILITY — a LEAF module, deliberately.
 *
 * This answers one question: can the WhatsApp channel actually send right now? It reads environment
 * only and imports nothing from the outbox handlers, so callers outside the outbox (dispatch, driver
 * onboarding) can ask WITHOUT pulling in the handler registry.
 *
 * WHY IT IS SEPARATE FROM twilio-whatsapp.ts: exporting the check from the handler created a real
 * import cycle — load-distribution.service -> twilio-whatsapp -> registry -> ... ->
 * dispatch-load-dispatched.handler -> load-distribution.service (17 files). The honest fix is to
 * extract the shared dependency, not to allowlist a cycle: a cycle here means the module-init order of
 * the outbox registry depends on a dispatch service, which is exactly the kind of coupling that turns
 * into an undefined-at-import bug later.
 *
 * WHY CALLERS MUST ASK BEFORE ENQUEUING: processor.ts marks an event whose handler is unavailable as
 * DELIVERED. A WhatsApp message queued without credentials is therefore recorded as a successful
 * delivery while nobody receives anything.
 */
const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM;
const WHATSAPP_MESSAGING_SERVICE_SID = process.env.TWILIO_WHATSAPP_MESSAGING_SERVICE_SID;
const DEFAULT_MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID;

/** True when credentials AND a sender (number or messaging service) are both configured. */
export function isWhatsappChannelConfigured(): boolean {
  const hasCredentials = Boolean(ACCOUNT_SID && AUTH_TOKEN);
  const hasSender = Boolean(WHATSAPP_FROM || WHATSAPP_MESSAGING_SERVICE_SID || DEFAULT_MESSAGING_SERVICE_SID);
  return hasCredentials && hasSender;
}
