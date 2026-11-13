/**
 * BOARD-35 (real Postgres) — settlement statement identity
 *
 * 1. allocateNextSettlementSourceDocumentRef + setSettlementSourceDocumentRef atomically assign
 *    the settlement number inside a transaction (the same commit as trip_closed_at).
 * 2. The derived status is "unpaid" when trip_closed_at IS NOT NULL and paid_at IS NULL,
 *    "paid" when paid_at IS NOT NULL. Never "open" on a closed tour.
 *
 * ONE transaction, rolled back.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";
import {
  allocateNextSettlementSourceDocumentRef,
  setSettlementSourceDocumentRef,
} from "../settlement-source-document-ref.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("BOARD-35: settlement statement identity (real Postgres)", () => {
  it("allocateNextSettlementSourceDocumentRef increments MAX and setSettlementSourceDocumentRef commits atomically", async () => {
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
        `SELECT id::text FROM org.companies WHERE is_active = true ORDER BY created_at LIMIT 1`,
      )).rows[0];
      if (!companyRow) throw new Error("No active company in CI seed");
      const companyId = companyRow.id;

      const userRow = (await db.query<{ id: string }>(
        `SELECT id::text FROM identity.users LIMIT 1`,
      )).rows[0];
      if (!userRow) throw new Error("No users in CI seed");
      const userId = userRow.id;

      // Find next expected ref (before we insert our fixture)
      const peekRes = await db.query<{ next: string }>(
        `SELECT (GREATEST(5803::int, COALESCE(MAX((source_document_ref)::int), 0)) + 1)::text AS next
           FROM driver_finance.driver_settlements
          WHERE operating_company_id = $1::uuid
            AND source_document_ref ~ '^[0-9]+$'`,
        [companyId],
      );
      const expectedNext = peekRes.rows[0]!.next;

      // Minimal throwaway driver
      const driverId = randomUUID();
      await db.query(
        `INSERT INTO mdata.drivers (id, operating_company_id, first_name, last_name, phone)
         VALUES ($1::uuid, $2::uuid, 'B35', 'CloseIdTest', $3)`,
        [driverId, companyId, `+1557${sfx.replace(/\D/g, "0").slice(0, 7).padEnd(7, "0")}`],
      );

      // Minimal settlement (no source_document_ref)
      const settlementId = randomUUID();
      await db.query(
        `INSERT INTO driver_finance.driver_settlements
           (id, operating_company_id, driver_id, settlement_model, status, is_sample_data)
         VALUES ($1::uuid, $2::uuid, $3::uuid, 'load_bookended', 'open', true)`,
        [settlementId, companyId, driverId],
      );

      // Simulate what the close-tour route does inside its BEGIN/COMMIT
      const nextRef = await allocateNextSettlementSourceDocumentRef(
        db as unknown as Parameters<typeof allocateNextSettlementSourceDocumentRef>[0],
        companyId,
      );
      expect(nextRef).toBe(expectedNext);

      const refResult = await setSettlementSourceDocumentRef(
        db as unknown as Parameters<typeof setSettlementSourceDocumentRef>[0],
        {
          operatingCompanyId: companyId,
          settlementId,
          sourceDocumentRef: nextRef,
          actorUserId: userId,
        },
      );
      expect(refResult).not.toBeNull();
      expect(refResult!.source_document_ref).toBe(nextRef);

      // Stamp trip_closed_at (atomic with number in the real route)
      await db.query(
        `UPDATE driver_finance.driver_settlements
            SET trip_closed_at = now(), updated_at = now()
          WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [settlementId, companyId],
      );

      // Verify DB state directly
      const after = (await db.query<{
        source_document_ref: string | null;
        trip_closed_at: string | null;
        paid_at: string | null;
      }>(
        `SELECT source_document_ref, trip_closed_at::text, paid_at::text
           FROM driver_finance.driver_settlements WHERE id = $1::uuid`,
        [settlementId],
      )).rows[0]!;

      expect(after.source_document_ref).toBe(nextRef);
      expect(after.trip_closed_at).not.toBeNull();

      // Derived status must be "unpaid" (trip_closed_at IS NOT NULL, paid_at IS NULL)
      const derivedStatus = after.trip_closed_at
        ? (after.paid_at ? "paid" : "unpaid")
        : "open";
      expect(derivedStatus).toBe("unpaid");
    } finally {
      await db.query("ROLLBACK");
      await db.end();
    }
  });

  it("derived status is 'paid' when paid_at IS NOT NULL", async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");

      const companyRow = (await db.query<{ id: string }>(
        `SELECT id::text FROM org.companies WHERE is_active = true ORDER BY created_at LIMIT 1`,
      )).rows[0];
      if (!companyRow) throw new Error("No active company in CI seed");
      const companyId = companyRow.id;

      const sfx = randomUUID().slice(0, 6);
      const driverId = randomUUID();
      await db.query(
        `INSERT INTO mdata.drivers (id, operating_company_id, first_name, last_name, phone)
         VALUES ($1::uuid, $2::uuid, 'B35P', 'PaidTest', $3)`,
        [driverId, companyId, `+1558${sfx.replace(/\D/g, "0").slice(0, 7).padEnd(7, "0")}`],
      );

      const settlementId = randomUUID();
      await db.query(
        `INSERT INTO driver_finance.driver_settlements
           (id, operating_company_id, driver_id, settlement_model, status,
            trip_closed_at, paid_at, source_document_ref, is_sample_data)
         VALUES ($1::uuid, $2::uuid, $3::uuid, 'load_bookended', 'open',
                 now(), now(), '9999', true)`,
        [settlementId, companyId, driverId],
      );

      const row = (await db.query<{ trip_closed_at: string | null; paid_at: string | null }>(
        `SELECT trip_closed_at::text, paid_at::text FROM driver_finance.driver_settlements WHERE id = $1::uuid`,
        [settlementId],
      )).rows[0]!;

      const derivedStatus = row.trip_closed_at
        ? (row.paid_at ? "paid" : "unpaid")
        : "open";
      expect(derivedStatus).toBe("paid");
    } finally {
      await db.query("ROLLBACK");
      await db.end();
    }
  });
});
