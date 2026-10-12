/**
 * LEAD 443.105 — real Postgres: fuel.fuel_transactions.location_id names a mdata.locations row of the SAME company
 * (fuel_transactions_location_same_company_fkey); another company's stop is refused. One transaction, rolled back.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("fuel transaction -> fuel stop location link (real Postgres)", () => {
  it("keeps a same-company stop and refuses another company's stop", async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      const company = async (tag: string) =>
        (await db.query<{ id: string }>(
          `INSERT INTO org.companies (code, legal_name, company_type) VALUES ($1 || substr(md5(random()::text), 1, 8), $1, 'operating_carrier') RETURNING id::text`,
          [tag]
        )).rows[0]!.id;
      const location = async (companyId: string) =>
        (await db.query<{ id: string }>(
          `INSERT INTO mdata.locations (operating_company_id, location_name, city, state) VALUES ($1::uuid, 'Fuel stop 443.105', 'Laredo', 'TX') RETURNING id::text`,
          [companyId]
        )).rows[0]!.id;
      const a = await company("LOC-A-");
      const b = await company("LOC-B-");
      const ownStop = await location(a);
      const otherStop = await location(b);
      const insertFuel = (stop: string) =>
        db.query(
          `INSERT INTO fuel.fuel_transactions (operating_company_id, transaction_at, purchased_at, fuel_type, total_cost, source,
                                               load_required, load_exemption_reason, source_row_hash, location_id)
           VALUES ($1::uuid, now(), now(), 'diesel', 100, 'manual', false, 'Yard fuel, no active trip for this unit', md5(random()::text), $2::uuid)
           RETURNING location_id::text`,
          [a, stop]
        );

      const kept = await insertFuel(ownStop);
      expect(kept.rows[0]?.location_id).toBe(ownStop);

      await db.query("SAVEPOINT cross_company");
      const refused = await insertFuel(otherStop).catch((e: Error) => e);
      await db.query("ROLLBACK TO SAVEPOINT cross_company");
      expect((refused as Error).message).toMatch(/fuel_transactions_location_same_company_fkey/);
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.end().catch(() => {});
    }
  });
});
