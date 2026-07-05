import { createHash, generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import jwt from "jsonwebtoken";
import { afterEach, describe, expect, it, vi } from "vitest";
import { plaidWebhookBodySchema, processPlaidWebhookAsync, verifyPlaidWebhookJwt } from "../../integrations/plaid/webhook-core.js";
import { registerBankingPlaidWebhookRoutes } from "./webhook.routes.js";

const plaidMocks = vi.hoisted(() => ({
  syncTransactions: vi.fn(async () => ({})),
  handleItemError: vi.fn(async () => undefined),
  handlePlaidItemLoginRequiredWebhook: vi.fn(async () => undefined),
}));

vi.mock("../../integrations/plaid/plaid.service.js", () => ({
  syncTransactions: plaidMocks.syncTransactions,
  handleItemError: plaidMocks.handleItemError,
  handlePlaidItemLoginRequiredWebhook: plaidMocks.handlePlaidItemLoginRequiredWebhook,
}));

function mockLogger(): FastifyInstance["log"] {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
  } as unknown as FastifyInstance["log"];
}

describe("banking/plaid/webhook.routes.ts", () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.PLAID_WEBHOOK_VERIFICATION_KEY;
  });

  it("plaidWebhookBodySchema accepts error:null (Plaid sends it on normal webhooks — regression for 233 rejected events)", () => {
    expect(plaidWebhookBodySchema.safeParse({ webhook_type: "TRANSACTIONS", webhook_code: "DEFAULT_UPDATE", item_id: "i1", error: null }).success).toBe(true);
    expect(plaidWebhookBodySchema.safeParse({ webhook_type: "ITEM", webhook_code: "ERROR", item_id: "i1", error: { error_code: "ITEM_LOGIN_REQUIRED" } }).success).toBe(true);
    expect(plaidWebhookBodySchema.safeParse({ webhook_type: "ITEM", webhook_code: "WEBHOOK_UPDATE_ACKNOWLEDGED", item_id: "i1" }).success).toBe(true);
  });

  it("registers POST /api/v1/banking/plaid/webhook", async () => {
    const app = Fastify({ logger: false });
    await registerBankingPlaidWebhookRoutes(app);
    expect(app.printRoutes()).toContain("api/v1/banking/plaid/webhook");
    await app.close();
  });

  // Signs a Plaid-style webhook JWT: ES256 with `request_body_sha256` bound to the raw body + `iat`.
  function signPlaidWebhook(
    privateKey: import("node:crypto").KeyObject,
    rawBody: string,
    opts: { iat?: number; sha256?: string } = {}
  ): string {
    const bodyHash = opts.sha256 ?? createHash("sha256").update(rawBody, "utf8").digest("hex");
    const iat = opts.iat ?? Math.floor(Date.now() / 1000);
    return jwt.sign({ request_body_sha256: bodyHash, iat }, privateKey, { algorithm: "ES256" });
  }

  it("verifyPlaidWebhookJwt accepts a fresh JWT whose request_body_sha256 matches the raw body", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    process.env.PLAID_WEBHOOK_VERIFICATION_KEY = JSON.stringify(publicKey.export({ format: "jwk" }));

    const rawBody = JSON.stringify({ webhook_type: "TRANSACTIONS", webhook_code: "DEFAULT_UPDATE", item_id: "i1" });
    const token = signPlaidWebhook(privateKey, rawBody);
    await expect(verifyPlaidWebhookJwt(token, rawBody)).resolves.toBe(true);
  });

  it("verifyPlaidWebhookJwt REJECTS a replay with a different body (request_body_sha256 mismatch)", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    process.env.PLAID_WEBHOOK_VERIFICATION_KEY = JSON.stringify(publicKey.export({ format: "jwk" }));

    const originalBody = JSON.stringify({ webhook_type: "TRANSACTIONS", webhook_code: "DEFAULT_UPDATE", item_id: "i1" });
    const token = signPlaidWebhook(privateKey, originalBody); // JWT bound to originalBody
    const tamperedBody = JSON.stringify({ webhook_type: "TRANSACTIONS", webhook_code: "DEFAULT_UPDATE", item_id: "ATTACKER" });
    await expect(verifyPlaidWebhookJwt(token, tamperedBody)).resolves.toBe(false);
  });

  it("verifyPlaidWebhookJwt REJECTS a stale JWT (iat older than 5 minutes) to block replay", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    process.env.PLAID_WEBHOOK_VERIFICATION_KEY = JSON.stringify(publicKey.export({ format: "jwk" }));

    const rawBody = JSON.stringify({ webhook_type: "TRANSACTIONS", webhook_code: "DEFAULT_UPDATE", item_id: "i1" });
    const staleIat = Math.floor(Date.now() / 1000) - 6 * 60; // 6 minutes old
    const token = signPlaidWebhook(privateKey, rawBody, { iat: staleIat });
    await expect(verifyPlaidWebhookJwt(token, rawBody)).resolves.toBe(false);
  });

  it("verifyPlaidWebhookJwt REJECTS a JWT missing the request_body_sha256 claim", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    process.env.PLAID_WEBHOOK_VERIFICATION_KEY = JSON.stringify(publicKey.export({ format: "jwk" }));

    const rawBody = JSON.stringify({ webhook_type: "TRANSACTIONS", webhook_code: "DEFAULT_UPDATE", item_id: "i1" });
    const token = jwt.sign({ iat: Math.floor(Date.now() / 1000) }, privateKey, { algorithm: "ES256" });
    await expect(verifyPlaidWebhookJwt(token, rawBody)).resolves.toBe(false);
  });

  it("verifyPlaidWebhookJwt rejects malformed tokens", async () => {
    process.env.PLAID_WEBHOOK_VERIFICATION_KEY = JSON.stringify(
      generateKeyPairSync("ec", { namedCurve: "P-256" }).publicKey.export({ format: "jwk" })
    );
    await expect(verifyPlaidWebhookJwt("not-a-jwt", "{}")).resolves.toBe(false);
  });

  // Static guard (G3-2): the body-hash + freshness checks must remain present in webhook-core.ts so
  // this replay-protection can't silently regress.
  it("STATIC GUARD: webhook-core binds the JWT to request_body_sha256 + iat freshness (constant-time)", () => {
    const corePath = fileURLToPath(new URL("../../integrations/plaid/webhook-core.ts", import.meta.url));
    const src = readFileSync(corePath, "utf8");
    expect(src).toContain("request_body_sha256");
    expect(src).toContain("timingSafeEqual");
    expect(src).toContain("MAX_WEBHOOK_AGE_SECONDS");
    expect(src).toMatch(/createHash\(["']sha256["']\)/);
    // verifyPlaidWebhookJwt must require the raw body as a parameter (not just the token).
    expect(src).toMatch(/verifyPlaidWebhookJwt\(\s*token:\s*string,\s*rawBody:/);
  });

  it("processPlaidWebhookAsync syncs transactions for TRANSACTIONS:SYNC_UPDATES_AVAILABLE", async () => {
    const logger = mockLogger();
    await processPlaidWebhookAsync(
      { webhook_type: "TRANSACTIONS", webhook_code: "SYNC_UPDATES_AVAILABLE", item_id: "item_123" },
      logger
    );
    expect(plaidMocks.syncTransactions).toHaveBeenCalledWith("item_123");
  });

  it("processPlaidWebhookAsync routes ITEM:LOGIN_REQUIRED to handlePlaidItemLoginRequiredWebhook", async () => {
    const logger = mockLogger();
    await processPlaidWebhookAsync({ webhook_type: "ITEM", webhook_code: "LOGIN_REQUIRED", item_id: "item_456" }, logger);
    expect(plaidMocks.handlePlaidItemLoginRequiredWebhook).toHaveBeenCalledWith("item_456");
  });

  it("processPlaidWebhookAsync routes ITEM:ERROR to handleItemError", async () => {
    const logger = mockLogger();
    await processPlaidWebhookAsync(
      {
        webhook_type: "ITEM",
        webhook_code: "ERROR",
        item_id: "item_789",
        error: { error_code: "ITEM_LOGIN_REQUIRED" },
      },
      logger
    );
    expect(plaidMocks.handleItemError).toHaveBeenCalledWith("item_789", "ITEM_LOGIN_REQUIRED");
  });

  it("processPlaidWebhookAsync logs AUTH:AUTOMATICALLY_VERIFIED", async () => {
    const logger = mockLogger();
    await processPlaidWebhookAsync({ webhook_type: "AUTH", webhook_code: "AUTOMATICALLY_VERIFIED", item_id: "item_z" }, logger);
    expect(logger.info).toHaveBeenCalled();
    expect(plaidMocks.syncTransactions).not.toHaveBeenCalled();
  });
});
