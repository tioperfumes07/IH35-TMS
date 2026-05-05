import Twilio from "twilio";
import type { OutboxEventHandler, OutboxHandlerContext, OutboxHandlerResult, OutboxPayload } from "./registry.js";

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const SMS_FROM = process.env.TWILIO_SMS_FROM;
const MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID;

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

export class TwilioSmsHandler implements OutboxEventHandler {
  eventType = "twilio.sms.send" as const;

  canHandle() {
    return Boolean(twilioClient() && (SMS_FROM || MESSAGING_SERVICE_SID));
  }

  async deliver(payload: OutboxPayload, ctx: OutboxHandlerContext): Promise<OutboxHandlerResult> {
    const client = twilioClient();
    if (!client) throw new Error("twilio_not_configured");

    const to = asText(payload.to);
    const body = asText(payload.body);
    if (!to) throw new Error("twilio_sms_missing_to");
    if (!body) throw new Error("twilio_sms_missing_body");

    const message = await client.messages.create({
      to,
      body,
      from: SMS_FROM || undefined,
      messagingServiceSid: SMS_FROM ? undefined : MESSAGING_SERVICE_SID || undefined,
    });

    ctx.log("outbox twilio.sms.send delivered", { eventId: ctx.eventId, sid: message.sid });
    return { message: `sid:${message.sid}` };
  }
}
