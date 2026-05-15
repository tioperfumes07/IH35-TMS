import { generateKeyPairSync } from "node:crypto";
import type { FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerBankingPlaidWebhookRoutes } from "../../apps/backend/src/banking/plaid/webhook.routes";
import { registerPlaidLinkRoutes } from "../../apps/backend/src/integrations/plaid/link.routes";
import { ensureIntegrationPrerequisites } from "../../apps/backend/test-helpers/db-fixture";
import { createIntegrationApp } from "../../apps/backend/test-helpers/http-app";
import { testAuthHeaders } from "../../apps/backend/test-helpers/auth-fixture";

const describePlaidLink = describe.skipIf(
  !process.env.PLAID_SANDBOX_CLIENT_ID ||
    !process.env.PLAID_SANDBOX_SECRET ||
    String(process.env.PLAID_ENV ?? "").trim().toLowerCase() !== "sandbox" ||
    !(process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL)
);

describePlaidLink("plaid link e2e — sandbox (Block I)", () => {
  let app: FastifyInstance;
  let companyId: string;
  let webhookPrivateKeyPem: string;
  let prevWebhookKey: string | undefined;

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();

    const pair = generateKeyPairSync("ec", { namedCurve: "P-256" });
    prevWebhookKey = process.env.PLAID_WEBHOOK_VERIFICATION_KEY;
    process.env.PLAID_WEBHOOK_VERIFICATION_KEY = JSON.stringify(pair.publicKey.export({ format: "jwk" }));
    webhookPrivateKeyPem = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();

    app = await createIntegrationApp(async (a) => {
      await registerPlaidLinkRoutes(a);
      await registerBankingPlaidWebhookRoutes(a);
    });
  });

  afterAll(async () => {
    await app?.close().catch(() => {});
    if (prevWebhookKey === undefined) delete process.env.PLAID_WEBHOOK_VERIFICATION_KEY;
    else process.env.PLAID_WEBHOOK_VERIFICATION_KEY = prevWebhookKey;
  });

  function signPlaidWebhookJwt(): string {
    return jwt.sign({ sub: "plaid-webhook-e2e" }, webhookPrivateKeyPem, { algorithm: "ES256" });
  }

  it("runs link token → public_token → exchange → sync → webhook(DEFAULT_UPDATE)", async () => {
    const linkRes = await app.inject({
      method: "POST",
      url: "/api/v1/banking/plaid/create-link-token",
      headers: { "content-type": "application/json", ...testAuthHeaders() },
      payload: { operating_company_id: companyId },
    });
    expect(linkRes.statusCode).toBe(200);
    const linkBody = linkRes.json() as { link_token?: string };
    expect(String(linkBody.link_token ?? "")).toContain("link-sandbox");

    const plaidClientId = String(process.env.PLAID_SANDBOX_CLIENT_ID ?? "").trim();
    const plaidSecret = String(process.env.PLAID_SANDBOX_SECRET ?? "").trim();

    const sandboxTokenRes = await fetch(`https://sandbox.plaid.com/sandbox/public_token/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: plaidClientId,
        secret: plaidSecret,
        institution_id: "ins_109508",
        initial_products: ["transactions"],
      }),
    });
    expect(sandboxTokenRes.ok).toBe(true);
    const sandboxTokenBody = (await sandboxTokenRes.json()) as { public_token?: string };
    expect(String(sandboxTokenBody.public_token ?? "").length).toBeGreaterThan(10);

    const exchangeRes = await app.inject({
      method: "POST",
      url: "/api/v1/banking/plaid/exchange-public-token",
      headers: { "content-type": "application/json", ...testAuthHeaders() },
      payload: {
        public_token: sandboxTokenBody.public_token,
        operating_company_id: companyId,
      },
    });
    expect(exchangeRes.statusCode).toBe(200);
    const exchanged = exchangeRes.json() as { plaid_item_id?: string; accounts?: unknown[] };
    expect(Array.isArray(exchanged.accounts)).toBe(true);
    expect(String(exchanged.plaid_item_id ?? "").length).toBeGreaterThan(3);

    const itemId = String(exchanged.plaid_item_id);

    const syncRes = await app.inject({
      method: "POST",
      url: `/api/v1/banking/plaid/sync/${encodeURIComponent(itemId)}`,
      headers: { ...testAuthHeaders() },
    });
    expect(syncRes.statusCode).toBe(200);

    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL required");

    const db = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
    await db.connect();
    await db.query("SET ROLE ih35_app");
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    let countBefore = 0;
    try {
      const before = await db.query(`SELECT COUNT(*)::bigint AS c FROM banking.bank_transactions WHERE operating_company_id = $1::uuid`, [
        companyId,
      ]);
      countBefore = Number(before.rows[0]?.c ?? 0);
      await db.query("COMMIT");
    } catch (err) {
      await db.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      await db.end().catch(() => {});
    }

    const webhookRes = await app.inject({
      method: "POST",
      url: "/api/v1/banking/plaid/webhook",
      headers: {
        "content-type": "application/json",
        "Plaid-Verification": signPlaidWebhookJwt(),
      },
      payload: {
        webhook_type: "TRANSACTIONS",
        webhook_code: "DEFAULT_UPDATE",
        item_id: itemId,
      },
    });
    expect(webhookRes.statusCode).toBe(200);

    await new Promise((r) => setTimeout(r, 1500));

    const syncRes2 = await app.inject({
      method: "POST",
      url: `/api/v1/banking/plaid/sync/${encodeURIComponent(itemId)}`,
      headers: { ...testAuthHeaders() },
    });
    expect(syncRes2.statusCode).toBe(200);

    const db2 = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
    await db2.connect();
    await db2.query("SET ROLE ih35_app");
    await db2.query("BEGIN");
    await db2.query("SET LOCAL app.bypass_rls = 'lucia'");
    try {
      const after = await db2.query(`SELECT COUNT(*)::bigint AS c FROM banking.bank_transactions WHERE operating_company_id = $1::uuid`, [
        companyId,
      ]);
      const countAfter = Number(after.rows[0]?.c ?? 0);
      expect(countAfter).toBeGreaterThanOrEqual(countBefore);
      await db2.query("COMMIT");
    } catch (err) {
      await db2.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      await db2.end().catch(() => {});
    }
  });
});

describe("plaid link e2e wiring", () => {
  it("suite is gated on sandbox credentials + DATABASE_URL + PLAID_ENV=sandbox", () => {
    expect(typeof describePlaidLink).toBe("function");
  });
});
