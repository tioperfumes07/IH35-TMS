/**
 * ENG-44 REVERSE (real Postgres) — reinstateDocumentThenVoidReversal("driver_bill") clears void
 * stamps and restores status='open'. A stray driver bill never reaches the GL, so
 * reinstatedFromVoidJeId is null and no GL restore step fires. ONE transaction, rolled back.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import { reinstateDocumentThenVoidReversal, ReinstateDocumentError } from "../../accounting/reinstate-document.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("ENG-44 REVERSE: reinstate voided driver bill (real Postgres)", () => {
  it("reinstates a void driver bill: status open, reinstated_at set, no GL restore needed", async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");

      const sfx = randomUUID().slice(0, 6);

      // Grab any company + user from CI seed
      const companyRow = (await db.query<{ id: string }>(
        `SELECT id::text FROM org.companies WHERE is_active = true ORDER BY created_at LIMIT 1`
      )).rows[0];
      if (!companyRow) throw new Error("No active company in CI seed");
      const companyId = companyRow.id;

      const userRow = (await db.query<{ id: string }>(
        `SELECT id::text FROM identity.users LIMIT 1`
      )).rows[0];
      if (!userRow) throw new Error("No users in CI seed");
      const userId = userRow.id;

      // Minimal throwaway driver
      const driverId = randomUUID();
      await db.query(
        `INSERT INTO mdata.drivers (id, operating_company_id, first_name, last_name, phone)
         VALUES ($1::uuid, $2::uuid, 'ENG44', 'ReinstateFix', $3)`,
        [driverId, companyId, `+1555${sfx.replace(/\D/g, "0").slice(0, 7).padEnd(7, "0")}`]
      );

      // Throwaway customer + load (is_sample_data=true so guard ratchets ignore it)
      const custId = randomUUID();
      await db.query(
        `INSERT INTO mdata.customers (id, operating_company_id, name, is_sample_data)
         VALUES ($1::uuid, $2::uuid, 'ENG44TestCust', true)`,
        [custId, companyId]
      );

      const loadId = randomUUID();
      const loadNum = `L-ENG44-${sfx.toUpperCase()}`;
      await db.query(
        `INSERT INTO mdata.loads (id, operating_company_id, load_number, customer_id, is_sample_data,
                                   status, origin_city, origin_state, destination_city, destination_state)
         VALUES ($1::uuid, $2::uuid, $3, $4::uuid, true,
                 'dispatched', 'Laredo', 'TX', 'Chicago', 'IL')`,
        [loadId, companyId, loadNum, custId]
      );

      // Voided driver bill — status='void' and voided_at both required by constraint
      const billId = randomUUID();
      const billNum = `DB-ENG44-${sfx.toUpperCase()}`;
      await db.query(
        `INSERT INTO driver_finance.driver_bills
           (id, operating_company_id, load_id, load_number, bill_number, driver_id,
            gross_amount_cents, status, voided_at, void_reason, voided_by_user_id)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6::uuid,
                 95000, 'void', now(), 'test reinstate fixture', $7::uuid)`,
        [billId, companyId, loadId, loadNum, billNum, driverId, userId]
      );

      // Run the reinstate engine (same function the route calls)
      const result = await reinstateDocumentThenVoidReversal(
        (fn) => fn(db as unknown as Parameters<typeof fn>[0]),
        {
          operatingCompanyId: companyId,
          type: "driver_bill",
          id: billId,
          reason: "ENG-44 real-PG reinstate test — stray bill fixture",
          actor: { userId, role: "Owner" },
        }
      );

      // GL restore not expected for a stray driver bill
      expect(result.reinstatedFromVoidJeId).toBeNull();
      expect(result.reinstatedAt).toBeTruthy();
      expect(result.restoreStatus).toBe("open");

      // Verify DB state directly
      const after = (await db.query<{
        status: string;
        voided_at: string | null;
        reinstated_at: string | null;
      }>(
        `SELECT status, voided_at::text, reinstated_at::text
           FROM driver_finance.driver_bills WHERE id = $1::uuid`,
        [billId]
      )).rows[0]!;

      expect(after.status).toBe("open");
      expect(after.voided_at).toBeNull();
      expect(after.reinstated_at).not.toBeNull();
    } finally {
      await db.query("ROLLBACK");
      await db.end();
    }
  });

  it("rejects reinstate of a live (non-void) driver bill with bill_not_void", async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");

      const sfx = randomUUID().slice(0, 6);

      const companyRow = (await db.query<{ id: string }>(
        `SELECT id::text FROM org.companies WHERE is_active = true ORDER BY created_at LIMIT 1`
      )).rows[0];
      if (!companyRow) throw new Error("No active company in CI seed");
      const companyId = companyRow.id;

      const userRow = (await db.query<{ id: string }>(
        `SELECT id::text FROM identity.users LIMIT 1`
      )).rows[0];
      if (!userRow) throw new Error("No users in CI seed");
      const userId = userRow.id;

      const driverId = randomUUID();
      await db.query(
        `INSERT INTO mdata.drivers (id, operating_company_id, first_name, last_name, phone)
         VALUES ($1::uuid, $2::uuid, 'ENG44B', 'RejectFix', $3)`,
        [driverId, companyId, `+1556${sfx.replace(/\D/g, "0").slice(0, 7).padEnd(7, "0")}`]
      );

      const custId = randomUUID();
      await db.query(
        `INSERT INTO mdata.customers (id, operating_company_id, name, is_sample_data)
         VALUES ($1::uuid, $2::uuid, 'ENG44TestCust2', true)`,
        [custId, companyId]
      );

      const loadId = randomUUID();
      const loadNum = `L-ENG44B-${sfx.toUpperCase()}`;
      await db.query(
        `INSERT INTO mdata.loads (id, operating_company_id, load_number, customer_id, is_sample_data,
                                   status, origin_city, origin_state, destination_city, destination_state)
         VALUES ($1::uuid, $2::uuid, $3, $4::uuid, true,
                 'dispatched', 'Laredo', 'TX', 'Chicago', 'IL')`,
        [loadId, companyId, loadNum, custId]
      );

      const billId = randomUUID();
      const billNum = `DB-ENG44B-${sfx.toUpperCase()}`;
      // Insert LIVE bill (status='open', no voided_at)
      await db.query(
        `INSERT INTO driver_finance.driver_bills
           (id, operating_company_id, load_id, load_number, bill_number, driver_id,
            gross_amount_cents, status)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6::uuid, 95000, 'open')`,
        [billId, companyId, loadId, loadNum, billNum, driverId]
      );

      await expect(
        reinstateDocumentThenVoidReversal(
          (fn) => fn(db as unknown as Parameters<typeof fn>[0]),
          {
            operatingCompanyId: companyId,
            type: "driver_bill",
            id: billId,
            reason: "ENG-44 reject test — not void",
            actor: { userId, role: "Owner" },
          }
        )
      ).rejects.toThrow(ReinstateDocumentError);
    } finally {
      await db.query("ROLLBACK");
      await db.end();
    }
  });
});
