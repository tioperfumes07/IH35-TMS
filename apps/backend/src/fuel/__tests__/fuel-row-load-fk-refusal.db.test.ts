/**
 * ACCT-F11107 (migration 202616460100) — real Postgres: a fuel row with no load and no exemption is refused by
 * accounting.enforce_load_fk_invariant() with its REAL reason (E_LOAD_FK_REQUIRED, P0001), never the schema error
 * `record "new" has no field "line_category"` (42703) the old RAISE produced on fuel.fuel_transactions. One transaction,
 * rolled back, on an isolated company — nothing is left behind.
 */
import pg from "pg";
import { describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { refuseProductionConnectionString, refuseProductionDatabase } from "../../../test-helpers/refuse-production.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("fuel row with no load — the load-FK trigger names its real refusal (real Postgres)", () => {
  it("refuses with E_LOAD_FK_REQUIRED (P0001), not 42703 line_category", async () => {
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    refuseProductionConnectionString(cs);
    const db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await refuseProductionDatabase(db);
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      const opco = (
        await db.query<{ id: string }>(
          `INSERT INTO org.companies (code, legal_name, company_type)
           VALUES ('F11107-' || substr(md5(random()::text), 1, 8), 'ACCT-F11107 load-FK test', 'operating_carrier') RETURNING id::text`
        )
      ).rows[0]!.id;
      const insert = (reason: string | null) =>
        db.query(
          `INSERT INTO fuel.fuel_transactions (operating_company_id, source_row_hash, transaction_reference, total_cost, load_exemption_reason)
           VALUES ($1::uuid, md5(random()::text), 'F11107-PROBE', 1, $2)`,
          [opco, reason]
        );

      await db.query("SAVEPOINT noload");
      const err = await insert(null).then(() => null, (e: { code?: string; message?: string }) => e);
      await db.query("ROLLBACK TO SAVEPOINT noload");
      expect(err?.code).toBe("P0001");
      expect(err?.message).toMatch(/^E_LOAD_FK_REQUIRED: fuel\.fuel_transactions fuel_type=diesel reference=F11107-PROBE requires load_id/);
      expect(err?.message).not.toMatch(/line_category/);

      await db.query("SAVEPOINT short");
      await expect(insert("short")).rejects.toThrow(/E_LOAD_EXEMPTION_REASON_TOO_SHORT/);
      await db.query("ROLLBACK TO SAVEPOINT short");
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.end();
    }
  });
});
