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

const TEMPLATE_REGISTRY: Record<string, string> = {
  driver_invite:
    "Hi {{driver_first_name}}! You've been invited to {{company_name}}'s driver app. Tap to set up: {{invite_url}} (expires in {{expires_hours}} hours)",
};

function renderTemplate(templateName: string, variables: Record<string, unknown>): string {
  const template = TEMPLATE_REGISTRY[templateName];
  if (!template) throw new Error("twilio_whatsapp_unknown_template");
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key: string) => {
    const value = variables[key];
    if (value === undefined || value === null) return "";
    return String(value);
  });
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
    if (!toRaw) throw new Error("twilio_whatsapp_missing_to");

    const templateName = asText(payload.template);
    const variablesRaw = payload.variables;
    const templateVariables =
      variablesRaw && typeof variablesRaw === "object" && !Array.isArray(variablesRaw)
        ? (variablesRaw as Record<string, unknown>)
        : {};
    const body = templateName ? renderTemplate(templateName, templateVariables) : asText(payload.body);
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
