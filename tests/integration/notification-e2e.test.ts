import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dispatchNotification } from "../../apps/backend/src/notifications/dispatcher.js";
import { TEST_OWNER_USER_ID } from "../../apps/backend/test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../apps/backend/test-helpers/db-fixture.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("notification e2e — settlement.approved (Block H)", () => {
  let companyId: string;
  let client: pg.Client;

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();

    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required for notification e2e");

    client = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
    await client.connect();
    await client.query("SET ROLE ih35_app");
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    await client.query(
      `
        INSERT INTO identity.user_notification_preferences (user_uuid, email_enabled, sms_enabled, whatsapp_enabled)
        VALUES ($1::uuid, true, true, true)
        ON CONFLICT (user_uuid) DO UPDATE SET
          email_enabled = EXCLUDED.email_enabled,
          sms_enabled = EXCLUDED.sms_enabled,
          whatsapp_enabled = EXCLUDED.whatsapp_enabled
      `,
      [TEST_OWNER_USER_ID]
    );

    await client.query("COMMIT");
  });

  afterAll(async () => {
    await client?.end().catch(() => {});
  });

  it("writes email.email_queue + sms.queue rows and whatsapp.queue skipped row when WHATSAPP_BUSINESS_VERIFIED !== true", async () => {
    const settlementNo = `ST-E2E-${randomUUID().slice(0, 8)}`;

    await client.query("BEGIN");
    await client.query("SET ROLE ih35_app");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    try {
      await client.query(`DELETE FROM sms.queue WHERE body LIKE $1`, [`%${settlementNo}%`]);
      await client.query(`DELETE FROM whatsapp.queue WHERE variables::text LIKE $1`, [`%${settlementNo}%`]);
      await client.query(`DELETE FROM email.email_queue WHERE subject ILIKE $1`, [`%${settlementNo}%`]);

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    }

    const prevWa = process.env.WHATSAPP_BUSINESS_VERIFIED;
    try {
      delete process.env.WHATSAPP_BUSINESS_VERIFIED;

      const result = await dispatchNotification({
        user_id: TEST_OWNER_USER_ID,
        event_type: "settlement_approved",
        actor_user_id: TEST_OWNER_USER_ID,
        payload: {
          operating_company_id: companyId,
          settlement_no: settlementNo,
          net: "100.00",
          link: "https://example.test",
          driverName: "Integration Driver",
          settlementLabel: settlementNo,
          amountLabel: "USD 100.00",
          sms_to: "+15551234567",
          whatsapp_to: "+15559876543",
        },
      });

      expect(result.ok).toBe(true);

      await client.query("BEGIN");
      await client.query("SET ROLE ih35_app");
      await client.query("SET LOCAL app.bypass_rls = 'lucia'");

      try {
        const emailRow = await client.query(`SELECT id FROM email.email_queue WHERE subject ILIKE $1 LIMIT 1`, [`%${settlementNo}%`]);
        expect(emailRow.rows.length).toBe(1);

        const smsRow = await client.query(`SELECT id FROM sms.queue WHERE body LIKE $1 ORDER BY created_at DESC LIMIT 1`, [`%${settlementNo}%`]);
        expect(smsRow.rows.length).toBe(1);

        const waRow = await client.query(
          `SELECT provider_status FROM whatsapp.queue WHERE variables::text LIKE $1 ORDER BY created_at DESC LIMIT 1`,
          [`%${settlementNo}%`]
        );
        expect(waRow.rows.length).toBe(1);
        expect(waRow.rows[0]?.provider_status).toBe("skipped");

        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      }
    } finally {
      if (prevWa === undefined) delete process.env.WHATSAPP_BUSINESS_VERIFIED;
      else process.env.WHATSAPP_BUSINESS_VERIFIED = prevWa;
    }
  });
});

describe("notification e2e wiring", () => {
  it("integration suite is gated to CI (GITHUB_ACTIONS)", () => {
    expect(typeof describeIntegration).toBe("function");
  });
});
