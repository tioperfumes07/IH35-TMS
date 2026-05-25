import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

const twilioCreateMock = vi.fn();
const twilioFactoryMock = vi.fn(() => ({
  verify: {
    v2: {
      services: vi.fn(() => ({
        verifications: {
          create: twilioCreateMock,
        },
        verificationChecks: {
          create: vi.fn(),
        },
      })),
    },
  },
}));

vi.mock("twilio", () => ({
  default: twilioFactoryMock,
}));

const withLuciaBypassMock = vi.fn(async (fn: (client: { query: (sql: string) => Promise<{ rows: unknown[] }> }) => Promise<unknown>) => {
  const client = {
    query: async (sql: string) => {
      if (sql.includes("SELECT id, deactivated_at FROM identity.users")) {
        return { rows: [{ id: "f47ac10b-58cc-4372-a567-0e02b2c3d479", deactivated_at: null }] };
      }
      return { rows: [] };
    },
  };
  return fn(client as never);
});

vi.mock("../db.js", () => ({
  withLuciaBypass: withLuciaBypassMock,
}));

vi.mock("../lucia.js", () => ({
  lucia: {
    createSession: vi.fn(),
    createSessionCookie: vi.fn(),
  },
}));

vi.mock("../session-cookie-policy.js", () => ({
  setLuciaSessionCookie: vi.fn(),
}));

vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn(),
}));

vi.mock("../../driver/driver-jwt.js", () => ({
  issueDriverTokenPair: vi.fn(),
}));

vi.mock("../../middleware/rate-limit.js", () => ({
  enforceAuthPhoneStartLimits: vi.fn(async () => true),
  enforceAuthPhoneVerifyLimits: vi.fn(async () => true),
}));

describe("twilio-verify lazy client + phone route behavior", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.clearAllMocks();
  });

  afterEach(async () => {
    process.env = { ...ORIGINAL_ENV };
    const mod = await import("../twilio-verify.js");
    mod.resetTwilioClientForTests();
    const requiredEnv = await import("../../config/required-env.js");
    requiredEnv.setDisabledFeatures(new Set());
  });

  it("getTwilioClient returns null when SID missing", async () => {
    process.env.TWILIO_ACCOUNT_SID = "";
    process.env.TWILIO_AUTH_TOKEN = "token";
    const mod = await import("../twilio-verify.js");
    expect(mod.getTwilioClient()).toBeNull();
  });

  it("getTwilioClient returns null when SID does not start with AC", async () => {
    process.env.TWILIO_ACCOUNT_SID = "bad-sid";
    process.env.TWILIO_AUTH_TOKEN = "token";
    const mod = await import("../twilio-verify.js");
    expect(mod.getTwilioClient()).toBeNull();
  });

  it("getTwilioClient returns client when valid envs are present", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC1234567890abcdef1234567890abcd";
    process.env.TWILIO_AUTH_TOKEN = "token";
    const mod = await import("../twilio-verify.js");
    const client = mod.getTwilioClient();
    expect(client).not.toBeNull();
    expect(twilioFactoryMock).toHaveBeenCalledTimes(1);
  });

  it("phone start route returns 503 when Twilio not configured", async () => {
    process.env.TWILIO_ACCOUNT_SID = "";
    process.env.TWILIO_AUTH_TOKEN = "";
    process.env.TWILIO_VERIFY_SERVICE_SID = "";

    const { registerPhoneAuthRoutes } = await import("../phone-routes.js");
    const app = Fastify({ logger: false });
    await registerPhoneAuthRoutes(app);
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/phone/start",
      payload: { phone: "+15555550100", channel: "sms" },
    });

    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body).error).toBe("twilio_verify_not_configured");
    await app.close();
  });

  it("phone start route delegates to Twilio client when configured", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC1234567890abcdef1234567890abcd";
    process.env.TWILIO_AUTH_TOKEN = "token";
    process.env.TWILIO_VERIFY_SERVICE_SID = "VA1234567890abcdef1234567890abcd";
    twilioCreateMock.mockResolvedValue({ sid: "VE123", status: "pending" });

    const { registerPhoneAuthRoutes } = await import("../phone-routes.js");
    const app = Fastify({ logger: false });
    await registerPhoneAuthRoutes(app);
    await app.ready();

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/phone/start",
      payload: { phone: "+15555550100", channel: "sms" },
    });

    expect(res.statusCode).toBe(200);
    expect(twilioCreateMock).toHaveBeenCalled();
    await app.close();
  });
});
