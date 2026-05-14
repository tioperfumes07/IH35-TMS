import { afterEach, describe, expect, it, vi } from "vitest";
import { sendWhatsAppMessage } from "./sender.js";

describe("sendWhatsAppMessage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.WHATSAPP_BUSINESS_VERIFIED;
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  });

  it("skips network calls when WHATSAPP_BUSINESS_VERIFIED is not true", async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = "token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "phone-id";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendWhatsAppMessage({
      to: "+15551234567",
      template_name: "ih35_load_assignment_v1",
      variables: {
        driver_name: "Ada",
        origin: "AUS",
        dest: "DAL",
        rate: "123",
        link: "https://example.test/driver",
      },
    });

    expect(result.success).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls Graph API with structured template components when verified", async () => {
    process.env.WHATSAPP_BUSINESS_VERIFIED = "true";
    process.env.WHATSAPP_ACCESS_TOKEN = "token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "phone-id";

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ messages: [{ id: "mid.123" }] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendWhatsAppMessage({
      to: "+1 (555) 123-4567",
      template_name: "ih35_load_assignment_v1",
      variables: {
        driver_name: "Ada",
        origin: "AUS",
        dest: "DAL",
        rate: "123",
        link: "https://example.test/driver",
      },
    });

    expect(result.success).toBe(true);
    expect(result.message_id).toBe("mid.123");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const call = fetchMock.mock.calls[0]!;
    expect(call[0]).toBe("https://graph.facebook.com/v18.0/phone-id/messages");
    expect(call[1]?.method).toBe("POST");

    const body = JSON.parse(String(call[1]?.body));
    expect(body.messaging_product).toBe("whatsapp");
    expect(body.to).toBe("15551234567");
    expect(body.type).toBe("template");
    expect(body.template.name).toBe("ih35_load_assignment_v1");
    expect(body.template.language.code).toBe("en_US");
    expect(body.template.components[0].type).toBe("body");
    expect(body.template.components[0].parameters.map((p: { text: string }) => p.text)).toEqual(["Ada", "AUS", "DAL", "123", "https://example.test/driver"]);
  });
});
