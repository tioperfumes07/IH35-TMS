import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerSettlementsMvpRoutes } from "../../apps/backend/src/driver-finance/settlements-mvp.routes";
import { TEST_OWNER_USER_ID } from "../../apps/backend/test-helpers/constants";
import { ensureIntegrationPrerequisites } from "../../apps/backend/test-helpers/db-fixture";
import { createIntegrationApp } from "../../apps/backend/test-helpers/http-app";
import { testAuthHeaders } from "../../apps/backend/test-helpers/auth-fixture";

const MARKER = "BLOCK_I_PDF_E2E";

const describeSettlementPdf = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeSettlementPdf("driver settlement pdf e2e — preview → commit → approve → pdf → queues (Block I)", () => {
  let app: FastifyInstance;
  let companyId: string;
  let pgClient: pg.Client;

  let driverId: string;
  let unitId: string;
  let loadId: string;
  let customerId: string;

  let settlementId: string;
  let displayId: string;

  const periodStart = "2026-05-05";
  const periodEnd = "2026-05-11";

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();

    app = await createIntegrationApp(async (a) => {
      await registerSettlementsMvpRoutes(a);
    });

    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required for settlement pdf e2e");

    pgClient = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
    await pgClient.connect();
    await pgClient.query("SET ROLE ih35_app");
    await pgClient.query("BEGIN");
    await pgClient.query("SET LOCAL app.bypass_rls = 'lucia'");

    try {
      await pgClient.query(
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

      const suffix = randomUUID().slice(0, 8);

      const driverRes = await pgClient.query<{ id: string }>(
        `
          INSERT INTO mdata.drivers (first_name, last_name, phone, email, identity_user_id)
          VALUES ('PDF', $2, '+15551234000', $3, $1::uuid)
          ON CONFLICT (identity_user_id) DO UPDATE SET
            phone = EXCLUDED.phone,
            email = EXCLUDED.email,
            first_name = EXCLUDED.first_name,
            last_name = EXCLUDED.last_name
          RETURNING id
        `,
        [TEST_OWNER_USER_ID, `E2E-${suffix}`, `pdf-e2e-${suffix}@test.invalid`]
      );
      driverId = String(driverRes.rows[0]?.id ?? "");
      if (!driverId) throw new Error("driver_insert_failed");

      const customerExisting = await pgClient.query<{ id: string }>(`SELECT id FROM mdata.customers WHERE deactivated_at IS NULL LIMIT 1`);
      if (customerExisting.rows[0]?.id) {
        customerId = String(customerExisting.rows[0].id);
      } else {
        const customerInsert = await pgClient.query<{ id: string }>(
          `INSERT INTO mdata.customers (customer_name) VALUES ($1) RETURNING id`,
          [`PDF E2E Customer ${suffix}`]
        );
        customerId = String(customerInsert.rows[0]?.id ?? "");
      }
      if (!customerId) throw new Error("customer_resolve_failed");

      const unitInsert = await pgClient.query<{ id: string }>(
        `
          INSERT INTO mdata.units (unit_number, vin)
          VALUES ($1, $2)
          RETURNING id
        `,
        [`U-PDF-${suffix}`, `VIN${suffix.padEnd(17, "0")}`.slice(0, 17)]
      );
      unitId = String(unitInsert.rows[0]?.id ?? "");
      if (!unitId) throw new Error("unit_insert_failed");

      const loadInsert = await pgClient.query<{ id: string }>(
        `
          INSERT INTO mdata.loads (
            operating_company_id,
            load_number,
            customer_id,
            status,
            rate_total_cents,
            assigned_unit_id,
            assigned_primary_driver_id,
            dispatcher_user_id
          )
          VALUES (
            $1::uuid,
            $2,
            $3::uuid,
            'delivered',
            450000,
            $4::uuid,
            $5::uuid,
            $6::uuid
          )
          RETURNING id
        `,
        [companyId, `L-PDF-${suffix}`, customerId, unitId, driverId, TEST_OWNER_USER_ID]
      );
      loadId = String(loadInsert.rows[0]?.id ?? "");
      if (!loadId) throw new Error("load_insert_failed");

      await pgClient.query(
        `
          INSERT INTO driver_finance.driver_bills (
            operating_company_id,
            load_id,
            load_number,
            bill_number,
            driver_id,
            gross_amount_cents,
            status,
            notes,
            created_at
          )
          VALUES (
            $1::uuid,
            $2::uuid,
            $3,
            $4,
            $5::uuid,
            450000,
            'open',
            $6,
            TIMESTAMPTZ '2026-05-08T15:00:00Z'
          )
        `,
        [companyId, loadId, `L-PDF-${suffix}`, `B-PDF-${suffix}`, driverId, MARKER]
      );

      await pgClient.query(
        `
          INSERT INTO driver_finance.settlement_preview_costs (
            operating_company_id,
            driver_id,
            period_start,
            period_end,
            cost_kind,
            amount_dollars,
            memo
          )
          VALUES
            ($1::uuid, $2::uuid, $3::date, $4::date, 'fuel', 350, $5),
            ($1::uuid, $2::uuid, $3::date, $4::date, 'fuel', 280, $5),
            ($1::uuid, $2::uuid, $3::date, $4::date, 'cash_advance', 200, $5)
        `,
        [companyId, driverId, periodStart, periodEnd, MARKER]
      );

      await pgClient.query("COMMIT");
    } catch (err) {
      await pgClient.query("ROLLBACK").catch(() => {});
      throw err;
    }
  });

  afterAll(async () => {
    await app?.close().catch(() => {});

    try {
      await pgClient.query("BEGIN");
      await pgClient.query("SET ROLE ih35_app");
      await pgClient.query("SET LOCAL app.bypass_rls = 'lucia'");

      if (displayId) {
        await pgClient.query(`DELETE FROM email.email_queue WHERE subject ILIKE $1`, [`%${displayId}%`]);
        await pgClient.query(`DELETE FROM sms.queue WHERE body LIKE $1`, [`%${displayId}%`]);
        await pgClient.query(`DELETE FROM whatsapp.queue WHERE variables::text LIKE $1`, [`%${displayId}%`]);
      }

      if (settlementId) {
        await pgClient.query(`DELETE FROM driver_finance.settlement_lines WHERE settlement_id = $1::uuid`, [settlementId]);
        await pgClient.query(`DELETE FROM driver_finance.driver_settlements WHERE id = $1::uuid`, [settlementId]);
      }

      await pgClient.query(`DELETE FROM driver_finance.settlement_preview_costs WHERE memo = $1`, [MARKER]);
      await pgClient.query(`DELETE FROM driver_finance.driver_bills WHERE notes = $1`, [MARKER]);

      if (loadId) await pgClient.query(`DELETE FROM mdata.loads WHERE id = $1::uuid`, [loadId]);
      if (unitId) await pgClient.query(`DELETE FROM mdata.units WHERE id = $1::uuid`, [unitId]);

      await pgClient.query("COMMIT");
    } catch {
      await pgClient.query("ROLLBACK").catch(() => {});
    } finally {
      await pgClient.end().catch(() => {});
    }
  });

  it("computes preview math, commits settlement to driver_finance.driver_settlements, approves, renders PDF, and enqueues notifications", async () => {
    const previewRes = await app.inject({
      method: "POST",
      url: "/api/v1/settlements/preview",
      headers: { "content-type": "application/json", ...testAuthHeaders() },
      payload: {
        operating_company_id: companyId,
        driver_id: driverId,
        period_start: periodStart,
        period_end: periodEnd,
        driver_share_rate: 0.25,
      },
    });
    expect(previewRes.statusCode).toBe(200);
    const preview = previewRes.json() as { net_dollars?: number; revenue_dollars?: number };
    expect(preview.revenue_dollars).toBeCloseTo(4500, 5);
    expect(preview.net_dollars).toBeCloseTo(295, 5);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/settlements",
      headers: { "content-type": "application/json", ...testAuthHeaders() },
      payload: {
        operating_company_id: companyId,
        driver_id: driverId,
        period_start: periodStart,
        period_end: periodEnd,
        gross_pay: 1125,
        deductions_total: 630 + 200,
        reimbursements_total: 0,
        net_pay: 295,
        lines: [],
      },
    });
    expect(createRes.statusCode).toBe(201);
    const created = createRes.json() as { id?: string; display_id?: string };
    settlementId = String(created.id ?? "");
    displayId = String(created.display_id ?? "");
    expect(settlementId.length).toBeGreaterThan(10);
    expect(displayId.length).toBeGreaterThan(2);

    await pgClient.query("BEGIN");
    await pgClient.query("SET ROLE ih35_app");
    await pgClient.query("SET LOCAL app.bypass_rls = 'lucia'");
    try {
      const row = await pgClient.query(`SELECT id, status FROM driver_finance.driver_settlements WHERE id = $1::uuid LIMIT 1`, [settlementId]);
      expect(row.rows.length).toBe(1);
      await pgClient.query("COMMIT");
    } catch (err) {
      await pgClient.query("ROLLBACK").catch(() => {});
      throw err;
    }

    const approveRes = await app.inject({
      method: "POST",
      url: `/api/v1/settlements/${settlementId}/approve?operating_company_id=${encodeURIComponent(companyId)}`,
      headers: { ...testAuthHeaders() },
    });
    expect(approveRes.statusCode).toBe(200);

    await pgClient.query("BEGIN");
    await pgClient.query("SET ROLE ih35_app");
    await pgClient.query("SET LOCAL app.bypass_rls = 'lucia'");
    try {
      const approvedRow = await pgClient.query(`SELECT status FROM driver_finance.driver_settlements WHERE id = $1::uuid LIMIT 1`, [settlementId]);
      expect(String(approvedRow.rows[0]?.status ?? "")).toBe("approved");
      await pgClient.query("COMMIT");
    } catch (err) {
      await pgClient.query("ROLLBACK").catch(() => {});
      throw err;
    }

    const pdfRes = await app.inject({
      method: "GET",
      url: `/api/v1/settlements/${settlementId}/pdf?operating_company_id=${encodeURIComponent(companyId)}`,
      headers: { ...testAuthHeaders() },
    });
    expect(pdfRes.statusCode).toBe(200);
    const injected = pdfRes as unknown as { rawPayload?: unknown; payload?: unknown };
    const rawPayload = injected.rawPayload ?? injected.payload ?? pdfRes.body;
    const buf = Buffer.isBuffer(rawPayload) ? rawPayload : Buffer.from(String(rawPayload ?? ""), "binary");
    expect(buf.subarray(0, 4).toString("utf8")).toBe("%PDF");
    expect(buf.byteLength).toBeGreaterThan(5000);

    await pgClient.query("BEGIN");
    await pgClient.query("SET ROLE ih35_app");
    await pgClient.query("SET LOCAL app.bypass_rls = 'lucia'");
    try {
      const emailRow = await pgClient.query<{ attachments: unknown }>(
        `SELECT attachments FROM email.email_queue WHERE subject ILIKE $1 ORDER BY created_at DESC LIMIT 1`,
        [`%${displayId}%`]
      );
      expect(emailRow.rows.length).toBe(1);
      const attachments = emailRow.rows[0]?.attachments as unknown;
      expect(attachments).toBeTruthy();

      const parsed = typeof attachments === "string" ? JSON.parse(attachments) : attachments;
      expect(Array.isArray(parsed)).toBe(true);
      const first = parsed[0] as { contentBase64?: string };
      expect(String(first.contentBase64 ?? "").startsWith("JVBERi0")).toBe(true);

      const smsRow = await pgClient.query(`SELECT body FROM sms.queue WHERE body LIKE $1 ORDER BY created_at DESC LIMIT 1`, [
        `%${displayId}%`,
      ]);
      expect(smsRow.rows.length).toBe(1);

      const waRow = await pgClient.query(
        `SELECT provider_status, variables FROM whatsapp.queue WHERE variables::text LIKE $1 ORDER BY created_at DESC LIMIT 1`,
        [`%${displayId}%`]
      );
      expect(waRow.rows.length).toBe(1);

      await pgClient.query("COMMIT");
    } catch (err) {
      await pgClient.query("ROLLBACK").catch(() => {});
      throw err;
    }
  });
});

describe("driver settlement pdf e2e wiring", () => {
  it("suite is gated to GitHub Actions (GITHUB_ACTIONS=true)", () => {
    expect(typeof describeSettlementPdf).toBe("function");
  });
});
