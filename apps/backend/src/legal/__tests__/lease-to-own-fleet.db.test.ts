/**
 * LEGAL lease-to-own fleet picker — real-schema execution guard (real Postgres)
 *
 * Why this exists: GET /api/v1/legal/contracts/lease-to-own/fleet 500'd with Postgres 42703
 * "column u.unit_type does not exist". listFleetUnitsForPicker() in lease-to-own.service.ts selected
 * mdata.units.unit_type — a phantom. The REAL discriminator column is vehicle_type (migration
 * 202606161400_units_add_vehicle_type); there is no unit_type column. Same bug class as the
 * per-truck-cpm 42703 — a query written against a column that never existed, where the unit tests
 * (if any) never ran the SQL.
 *
 * This test RUNS listFleetUnitsForPicker against a migrated Postgres so the whole fleet query is
 * parsed/planned against the real schema — a wrong column on a real table now throws 42703 here and
 * fails CI. Runs only in CI (GITHUB_ACTIONS=true); harness copied verbatim from
 * accounting/__tests__/bill-expense-lines-rls.db.test.ts (buildPgClientConfig(cs) + skipIf).
 */

import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";
import { listFleetUnitsForPicker } from "../lease-to-own.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("legal lease-to-own fleet picker (real Postgres schema)", () => {
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

    // Seed one owned, in-service unit with vehicle_type set (the real column the picker aliases to unit_type).
    // owner_company_id is NOT NULL (mig 0015); units are owner/lessee-scoped, not operating_company_id (§4).
    await withBypass(async () => {
      await db.query(
        `INSERT INTO mdata.units (id, unit_number, vin, status, owner_company_id, vehicle_type)
         VALUES ($1::uuid, $2, $3, 'InService', $4::uuid, 'tractor')`,
        [unitId, `LTO-${suffix.slice(0, 8)}`, `LTOVIN${suffix.replace(/-/g, "").slice(0, 11)}`, companyId]
      );
    });
  });

  afterAll(async () => {
    if (!db) return;
    // void-not-delete; UPDATE is granted on mdata.units. The picker filters deactivated_at IS NULL so this hides it.
    await withBypass(async () => {
      await db.query(`UPDATE mdata.units SET deactivated_at = now() WHERE id = $1::uuid`, [unitId]);
    }).catch(() => {});
    await db.end().catch(() => {});
  });

  it("runs the fleet query against the real schema without a phantom-column error (42703)", async () => {
    // Both code paths: no owner filter, and an owner-scoped filter — each plans the full query.
    const all = await withBypass(() => listFleetUnitsForPicker(db, { ownerCompanyId: null }));
    expect(Array.isArray(all)).toBe(true);
    const scoped = await withBypass(() => listFleetUnitsForPicker(db, { ownerCompanyId: companyId }));
    expect(Array.isArray(scoped)).toBe(true);
  });

  it("returns mdata.units.vehicle_type aliased as unit_type for the seeded unit", async () => {
    const rows = await withBypass(() => listFleetUnitsForPicker(db, { ownerCompanyId: companyId }));
    const seeded = rows.find((r) => r.id === unitId);
    expect(seeded, "seeded unit should be in the owner-scoped picker").toBeDefined();
    expect(seeded?.unit_type).toBe("tractor"); // proves vehicle_type -> unit_type alias, real column
    expect(seeded?.status).toBe("InService");
    expect(seeded?.owner_company_id).toBe(companyId);
  });
});
