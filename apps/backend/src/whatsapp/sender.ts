import { whatsappTemplateRegistry } from "./templates/index.js";

const GRAPH_API_VERSION = "v18.0";

function normalizeRecipient(raw: string): string {
  return raw.replace(/\D/g, "");
}

function resolveRegistryEntry(templateName: string) {
  return whatsappTemplateRegistry.find((entry) => entry.name === templateName) ?? null;
}

export async function sendWhatsAppMessage(input: {
  to: string;
  template_name: string;
  variables: Record<string, string>;
}): Promise<{ success: boolean; message_id?: string; error?: string }> {
  const verified = process.env.WHATSAPP_BUSINESS_VERIFIED === "true";
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();

  if (!verified) {
    console.warn("[whatsapp] WHATSAPP_BUSINESS_VERIFIED is not 'true'; skipping Cloud API send", {
      to: input.to,
      template_name: input.template_name,
    });
    return { success: true };
  }

  if (!token || !phoneNumberId) {
    const message = "missing_whatsapp_credentials";
    console.warn("[whatsapp]", message);
    return { success: false, error: message };
  }

  const entry = resolveRegistryEntry(input.template_name);
  if (!entry) {
    return { success: false, error: "unknown_whatsapp_template" };
  }

  const parameters = entry.variables.map((key) => ({
    type: "text",
    text: String(input.variables[key] ?? ""),
  }));

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: normalizeRecipient(input.to),
        type: "template",
        template: {
          name: input.template_name,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || "en_US" },
          components: [{ type: "body", parameters }],
        },
      }),
    });

    const json = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      const errMsg =
        typeof json.error === "object" && json.error && "message" in (json.error as object)
          ? String((json.error as { message?: unknown }).message ?? "whatsapp_send_failed")
          : `whatsapp_http_${response.status}`;
      console.warn("[whatsapp] send failed", { status: response.status, errMsg, json });
      return { success: false, error: errMsg };
    }

    const messages = Array.isArray(json.messages) ? json.messages : [];
    const first = messages[0] as { id?: unknown } | undefined;
    const messageId = typeof first?.id === "string" ? first.id : undefined;
    return { success: true, message_id: messageId };
  } catch (error) {
    const message = String((error as Error)?.message ?? "whatsapp_fetch_failed");
    console.warn("[whatsapp] fetch error", message);
    return { success: false, error: message };
  }
}
