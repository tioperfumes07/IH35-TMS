import { afterEach, describe, expect, it, vi } from "vitest";
import { sendSms } from "./sender.js";

describe("sendSms", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_FROM_NUMBER;
    delete process.env.TWILIO_SMS_FROM;
    delete process.env.TWILIO_FROM;
  });

  it("returns success:false when Twilio credentials are missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendSms({ to: "+15551234567", body: "hello" });

    expect(result.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts form-encoded credentials to Twilio Messages API", async () => {
    process.env.TWILIO_ACCOUNT_SID = "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
    process.env.TWILIO_AUTH_TOKEN = "secret";
    process.env.TWILIO_FROM_NUMBER = "+15557654321";

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ sid: "SM123" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendSms({ to: "5551234567", body: "hello world" });

    expect(result.success).toBe(true);
    expect(result.sid).toBe("SM123");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/Messages.json");
    expect(init?.method).toBe("POST");
    expect(String(init?.headers && (init.headers as Record<string, string>)["Authorization"])).toMatch(/^Basic /);

    const body = String(init?.body);
    expect(body).toContain("To=%2B15551234567");
    expect(body).toContain("From=%2B15557654321");
    expect(body).toContain("Body=hello+world");
  });
});
