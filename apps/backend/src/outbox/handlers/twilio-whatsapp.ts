import Twilio from "twilio";
import type { OutboxEventHandler, OutboxHandlerContext, OutboxHandlerResult, OutboxPayload } from "./registry.js";

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM;
const WHATSAPP_MESSAGING_SERVICE_SID = process.env.TWILIO_WHATSAPP_MESSAGING_SERVICE_SID;
const DEFAULT_MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID;

let cachedClient: ReturnType<typeof Twilio> | null = null;

function twilioClient() {
  if (!ACCOUNT_SID || !AUTH_TOKEN) return null;
  if (!cachedClient) cachedClient = Twilio(ACCOUNT_SID, AUTH_TOKEN);
  return cachedClient;
}

function asText(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function toWhatsAppAddress(value: string) {
  return value.startsWith("whatsapp:") ? value : `whatsapp:${value}`;
}

export class TwilioWhatsappHandler implements OutboxEventHandler {
  eventType = "twilio.whatsapp.send" as const;

  canHandle() {
    return Boolean(twilioClient() && (WHATSAPP_FROM || WHATSAPP_MESSAGING_SERVICE_SID || DEFAULT_MESSAGING_SERVICE_SID));
  }

  async deliver(payload: OutboxPayload, ctx: OutboxHandlerContext): Promise<OutboxHandlerResult> {
    const client = twilioClient();
    if (!client) throw new Error("twilio_not_configured");

    const toRaw = asText(payload.to);
    const body = asText(payload.body);
    if (!toRaw) throw new Error("twilio_whatsapp_missing_to");
    if (!body) throw new Error("twilio_whatsapp_missing_body");

    const to = toWhatsAppAddress(toRaw);
    const from = WHATSAPP_FROM ? toWhatsAppAddress(WHATSAPP_FROM) : undefined;
    const messagingServiceSid = from ? undefined : WHATSAPP_MESSAGING_SERVICE_SID || DEFAULT_MESSAGING_SERVICE_SID || undefined;

    const message = await client.messages.create({
      to,
      body,
      from,
      messagingServiceSid,
    });

    ctx.log("outbox twilio.whatsapp.send delivered", { eventId: ctx.eventId, sid: message.sid });
    return { message: `sid:${message.sid}` };
  }
}
