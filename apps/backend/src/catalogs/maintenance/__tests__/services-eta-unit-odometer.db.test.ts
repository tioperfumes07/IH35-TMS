/**
 * services/eta unit-odometer query — real-schema guard (real Postgres)
 *
 * GET /api/v1/maintenance/services/eta 500'd on every call: it selected
 *   SELECT hub_meter_current FROM mdata.units WHERE id=$1 AND operating_company_id=$2
 * — BOTH columns are phantom on mdata.units (real odometer = odometer_mi, mig 202606211400; units are
 * owner/lessee-scoped, no operating_company_id, mig 0015) → Postgres 42703. Same class as per-truck-cpm /
 * legal-fleet. This test RUNS the FIXED query against migrated CI Postgres so any phantom column on
 * mdata.units fails CI. Harness copied from accounting/__tests__/bill-expense-lines-rls.db.test.ts.
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../../test-helpers/db-fixture.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("services/eta unit odometer (real mdata.units schema)", () => {
  let db: pg.Client;
  let companyId: string;
  const suffix = randomUUID();
  const unitId = randomUUID();

  async function withBypass<T>(fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    try {
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      const out = await fn();
      await db.query("COMMIT");
      return out;
    } catch (err) {
      await db.query("ROLLBACK").catch(() => {});
      throw err;
    }
  }

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");
    await withBypass(async () => {
      await db.query(
        `INSERT INTO mdata.units (id, unit_number, vin, status, owner_company_id, odometer_mi)
         VALUES ($1::uuid, $2, $3, 'InService', $4::uuid, 123456)`,
        [unitId, `ETA-${suffix.slice(0, 8)}`, `ETAVIN${suffix.replace(/-/g, "").slice(0, 11)}`, companyId]
      );
    });
  });

  afterAll(async () => {
    if (!db) return;
    await withBypass(async () => {
      await db.query(`UPDATE mdata.units SET deactivated_at = now() WHERE id = $1::uuid`, [unitId]);
    }).catch(() => {});
    await db.end().catch(() => {});
  });

  it("runs the FIXED odometer query against real schema (no phantom column 42703) + returns odometer_mi", async () => {
    const res = await withBypass(() =>
      db.query<{ hub_meter_current: number | null }>(
        "SELECT odometer_mi AS hub_meter_current FROM mdata.units WHERE id = $1 AND COALESCE(currently_leased_to_company_id, owner_company_id) = $2 LIMIT 1",
        [unitId, companyId]
      )
    );
    expect(res.rows).toHaveLength(1); // owner-scoped match found
    expect(Number(res.rows[0].hub_meter_current)).toBe(123456); // real odometer_mi value surfaced
  });
});
