/**
 * PER-TRUCK-CPM real-schema execution guard (real Postgres)
 *
 * Why this exists (root-process fix):
 *   reports/per-truck-cpm 500'd TWICE in prod on phantom columns the unit-test mocks never
 *   exercised — first insurance.* (42P01, #1515), then the permits CTE referencing
 *   master_data.unit_permits.unit_id / .annual_cost_cents which never existed (42703). The REAL
 *   columns (migration 0407_permits_toll_tags) are unit_uuid + cost numeric(8,2). The prior static
 *   grep guard (scripts/verify-per-truck-cpm-no-phantom.mjs) could only match phantom TABLE names and
 *   was wired into NOTHING in CI — so #1515 went green while prod still 500'd.
 *
 * This test RUNS calculatePerTruckCpm against a migrated Postgres so EVERY CTE (load_scope, miles,
 * driver_pay, fuel, maint, insurance, permits) is parsed/planned against the real schema. A
 * wrong-column-on-a-real-table now throws 42703 here and fails CI — exactly the class of bug that
 * slipped through twice. Test 2 additionally seeds a unit + permit and exercises the permits CTE
 * columns directly to prove the repoint computes a real per-day cost.
 *
 * Runs only in CI (GITHUB_ACTIONS=true) where a migrated Postgres is available, matching the
 * accounting DB integration suites (see bill-expense-lines-rls.db.test.ts — harness copied verbatim).
 */

import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../../test-helpers/db-fixture.js";
import { calculatePerTruckCpm } from "../cpm-calculator.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("per-truck-cpm calculator (real Postgres schema)", () => {
  let db: pg.Client;
  let companyId: string;

  // Unique per run so parallel vitest forks never collide.
  const suffix = randomUUID();
  const unitId = randomUUID();
  const permitId = randomUUID();

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

    // Seed: one unit + one unit_permit (real master_data.unit_permits columns) for the permits-CTE proof.
    await withBypass(async () => {
      await db.query(
        `INSERT INTO mdata.units (id, unit_number, vin, status) VALUES ($1::uuid, $2, $3, 'InService')`,
        [unitId, `CPM-${suffix.slice(0, 8)}`, `CPMVIN${suffix.replace(/-/g, "").slice(0, 11)}`]
      );
      await db.query(
        `
          INSERT INTO master_data.unit_permits
            (uuid, operating_company_id, unit_uuid, permit_type, issuing_state, permit_number,
             effective_date, expiration_date, cost)
          VALUES ($1::uuid, $2::uuid, $3::uuid, 'oversize', 'TX', $4,
             DATE '2026-01-01', DATE '2026-12-31', 365.00)
        `,
        [permitId, companyId, unitId, `PMT-${suffix.slice(0, 8)}`]
      );
    });
  });

  afterAll(async () => {
    if (!db) return;
    // void-not-delete + grant-safe: ih35_app has SELECT/INSERT/UPDATE (no DELETE) on
    // master_data.unit_permits (migration 0407). Soft-delete both fixtures via UPDATE; the permits CTE
    // filters deleted_at IS NULL and the report filters deactivated_at IS NULL, so neither leaks.
    await withBypass(async () => {
      await db.query(`UPDATE master_data.unit_permits SET deleted_at = now() WHERE uuid = $1::uuid`, [permitId]);
      await db.query(`UPDATE mdata.units SET deactivated_at = now() WHERE id = $1::uuid`, [unitId]);
    }).catch(() => {});
    await db.end().catch(() => {});
  });

  it("executes EVERY CTE against the real schema without a phantom-column error (42703/42P01)", async () => {
    // The whole query is a single statement: Postgres parses/plans load_scope, miles, driver_pay,
    // fuel, maint, insurance AND permits even with zero matching rows. Any wrong column on a real
    // table throws here — this is the guard that would have caught the insurance 42P01 and permits 42703.
    const rows = await calculatePerTruckCpm(db, companyId, "2026-01-01", "2026-12-31");
    expect(Array.isArray(rows)).toBe(true);
  });

  it("permits CTE pulls the REAL columns (unit_uuid + cost) and computes a per-day prorated cost", async () => {
    // Exercise the exact repointed permits CTE in isolation against the seeded permit:
    // cost 365.00 over a 365-day term = $1/day -> 100 cents/day; * full-year window (365 days) = 36500 cents.
    const res = await withBypass(async () =>
      db.query<{ unit_id: string; cents: string }>(
        `
          SELECT up.unit_uuid AS unit_id,
                 COALESCE(
                   SUM(
                     ROUND(
                       (COALESCE(up.cost, 0) * 100)::numeric
                       / GREATEST(1, (up.expiration_date - up.effective_date + 1))
                       * GREATEST(1, ($3::date - $2::date + 1))
                     )
                   ),
                   0
                 )::bigint AS cents
          FROM master_data.unit_permits up
          WHERE up.operating_company_id = $1::uuid
            AND up.unit_uuid = $4::uuid
            AND up.deleted_at IS NULL
          GROUP BY up.unit_uuid
        `,
        [companyId, "2026-01-01", "2026-12-31", unitId]
      )
    );
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].unit_id).toBe(unitId);
    // 365.00 / 365 days * 365 window = 365.00 -> 36500 cents (real, not the degraded 0).
    expect(Number(res.rows[0].cents)).toBe(36500);
  });
});
