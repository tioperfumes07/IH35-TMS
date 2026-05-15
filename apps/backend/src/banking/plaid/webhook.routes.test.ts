import { generateKeyPairSync } from "node:crypto";
import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import jwt from "jsonwebtoken";
import { afterEach, describe, expect, it, vi } from "vitest";
import { processPlaidWebhookAsync, verifyPlaidWebhookJwt } from "../../integrations/plaid/webhook-core.js";
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

  it("registers POST /api/v1/banking/plaid/webhook", async () => {
    const app = Fastify({ logger: false });
    await registerBankingPlaidWebhookRoutes(app);
    expect(app.printRoutes()).toContain("api/v1/banking/plaid/webhook");
    await app.close();
  });

  it("verifyPlaidWebhookJwt verifies ES256 JWTs against PLAID_WEBHOOK_VERIFICATION_KEY (JWK)", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    process.env.PLAID_WEBHOOK_VERIFICATION_KEY = JSON.stringify(publicKey.export({ format: "jwk" }));

    const token = jwt.sign({ sub: "plaid-webhook-test" }, privateKey, { algorithm: "ES256" });
    await expect(verifyPlaidWebhookJwt(token)).resolves.toBe(true);
  });

  it("verifyPlaidWebhookJwt rejects malformed tokens", async () => {
    process.env.PLAID_WEBHOOK_VERIFICATION_KEY = JSON.stringify(
      generateKeyPairSync("ec", { namedCurve: "P-256" }).publicKey.export({ format: "jwk" })
    );
    await expect(verifyPlaidWebhookJwt("not-a-jwt")).resolves.toBe(false);
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
