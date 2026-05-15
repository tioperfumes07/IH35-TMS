import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Db from "../auth/db.js";

vi.mock("../auth/db.js", () => ({
  withLuciaBypass: vi.fn(async (fn: (client: { query: (sql: string) => Promise<{ rows: unknown[] }> }) => Promise<unknown>) => {
    const fakeClient = {
      query: vi.fn(async () => ({ rows: [{ ok: 1 }] })),
    };
    return fn(fakeClient);
  }),
}));

const { RedisMock } = vi.hoisted(() => ({
  RedisMock: vi.fn(),
}));

vi.mock("ioredis", () => ({
  Redis: RedisMock,
  default: RedisMock,
}));

vi.mock("@aws-sdk/client-s3", () => {
  class HeadBucketCommand {
    constructor(public input: unknown) {}
  }

  class S3Client {
    send = vi.fn(async () => ({}));
  }

  return { S3Client, HeadBucketCommand };
});

import { runAdminDeepHealthProbe } from "./health-deep.service.js";

describe("admin/health-deep.service.ts — runAdminDeepHealthProbe", () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...envSnapshot };

    RedisMock.mockImplementation(() => ({
      ping: vi.fn().mockResolvedValue("PONG"),
      disconnect: vi.fn(),
    }));

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url.includes("sandbox.plaid.com")) return new Response(JSON.stringify({ public_token: "pt-sandbox-mock" }), { status: 200 });
        if (url.includes("quickbooks.api.intuit.com")) return new Response(JSON.stringify({ QueryResponse: {} }), { status: 200 });
        return new Response("{}", { status: 404 });
      }) as unknown as typeof fetch
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...envSnapshot };
  });

  it("marks Postgres as failed when SELECT 1 fails (critical path)", async () => {
    vi.mocked(Db.withLuciaBypass).mockRejectedValueOnce(new Error("postgres_down"));
    const probe = await runAdminDeepHealthProbe();
    const pg = probe.checks.find((c) => c.name === "postgres.select1");
    expect(pg?.tier).toBe("critical");
    expect(pg?.ok).toBe(false);
    expect(probe.checks.filter((c) => c.tier === "critical").every((c) => c.ok)).toBe(false);
  });

  it("skips Redis when REDIS_URL is unset", async () => {
    Reflect.deleteProperty(process.env, "REDIS_URL");
    const probe = await runAdminDeepHealthProbe();
    const redis = probe.checks.find((c) => c.name === "redis.ping");
    expect(redis?.skipped).toBe(true);
    expect(redis?.tier).toBe("non_critical");
    expect(redis?.ok).toBe(true);
    expect(RedisMock).not.toHaveBeenCalled();
  });

  it("records Redis failures as non-critical when REDIS_URL is set", async () => {
    process.env.REDIS_URL = "redis://127.0.0.1:9";
    RedisMock.mockImplementation(() => ({
      ping: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
      disconnect: vi.fn(),
    }));

    const probe = await runAdminDeepHealthProbe();
    const redis = probe.checks.find((c) => c.name === "redis.ping");
    expect(redis?.tier).toBe("non_critical");
    expect(redis?.ok).toBe(false);
    expect(String(redis?.error ?? "").length).toBeGreaterThan(0);
  });

  it("fails R2 when credentials are not configured", async () => {
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;

    const probe = await runAdminDeepHealthProbe();
    const r2 = probe.checks.find((c) => c.name === "r2.head_bucket");
    expect(r2?.tier).toBe("non_critical");
    expect(r2?.ok).toBe(false);
    expect(String(r2?.error ?? "")).toContain("r2_not_configured");
  });

  it("skips Plaid sandbox probe when sandbox credentials are missing", async () => {
    delete process.env.PLAID_SANDBOX_CLIENT_ID;
    delete process.env.PLAID_SANDBOX_SECRET;
    delete process.env.PLAID_ENV;
    delete process.env.PLAID_CLIENT_ID;
    delete process.env.PLAID_SECRET;

    const probe = await runAdminDeepHealthProbe();
    const plaid = probe.checks.find((c) => c.name === "plaid.sandbox.public_token.create");
    expect(plaid?.skipped).toBe(true);
    expect(plaid?.ok).toBe(true);
  });

  it("surfaces Plaid sandbox HTTP failures when credentials exist", async () => {
    process.env.PLAID_SANDBOX_CLIENT_ID = "sandbox_client";
    process.env.PLAID_SANDBOX_SECRET = "sandbox_secret";

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url.includes("sandbox.plaid.com")) return new Response(JSON.stringify({}), { status: 500 });
        if (url.includes("quickbooks.api.intuit.com")) return new Response(JSON.stringify({ QueryResponse: {} }), { status: 200 });
        return new Response("{}", { status: 404 });
      }) as unknown as typeof fetch
    );

    const probe = await runAdminDeepHealthProbe();
    const plaid = probe.checks.find((c) => c.name === "plaid.sandbox.public_token.create");
    expect(plaid?.ok).toBe(false);
    expect(String(plaid?.error ?? "")).toMatch(/plaid_sandbox_public_token_http_500/i);
  });

  it("skips QBO when credentials are missing", async () => {
    delete process.env.QBO_DEFAULT_REALM_ID;
    delete process.env.QBO_REALM_ID;
    delete process.env.INTUIT_REALM_ID;
    delete process.env.QBO_ACCESS_TOKEN;

    const probe = await runAdminDeepHealthProbe();
    const qbo = probe.checks.find((c) => c.name === "qbo.companyinfo");
    expect(qbo?.skipped).toBe(true);
    expect(qbo?.ok).toBe(true);
  });

  it("skips QBO when Intuit returns 401 (token expired / invalid)", async () => {
    process.env.QBO_DEFAULT_REALM_ID = "1234567890";
    process.env.QBO_ACCESS_TOKEN = "bad-token";

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url.includes("sandbox.plaid.com")) return new Response(JSON.stringify({ public_token: "pt" }), { status: 200 });
        if (url.includes("quickbooks.api.intuit.com")) return new Response(JSON.stringify({ fault: "auth" }), { status: 401 });
        return new Response("{}", { status: 404 });
      }) as unknown as typeof fetch
    );

    const probe = await runAdminDeepHealthProbe();
    const qbo = probe.checks.find((c) => c.name === "qbo.companyinfo");
    expect(qbo?.skipped).toBe(true);
    expect(qbo?.error).toBe("skipped_expired_or_invalid_token");
  });

  it("skips QBO when Intuit signals reconnect via structured payload", async () => {
    process.env.QBO_DEFAULT_REALM_ID = "1234567890";
    process.env.QBO_ACCESS_TOKEN = "good-but-app-forces-reconnect";

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url.includes("sandbox.plaid.com")) return new Response(JSON.stringify({ public_token: "pt" }), { status: 200 });
        if (url.includes("quickbooks.api.intuit.com")) {
          return new Response(JSON.stringify({ needs_reconnect: true }), { status: 400 });
        }
        return new Response("{}", { status: 404 });
      }) as unknown as typeof fetch
    );

    const probe = await runAdminDeepHealthProbe();
    const qbo = probe.checks.find((c) => c.name === "qbo.companyinfo");
    expect(qbo?.skipped).toBe(true);
    expect(qbo?.error).toBe("skipped_needs_reconnect");
  });
});
