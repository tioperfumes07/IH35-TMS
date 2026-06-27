/**
 * Driver-picker 50-cap regression guard (real Postgres)
 *
 * LIVE BUG: the Book Load dispatchable driver picker (InlineDriverPicker → listDrivers) called
 * /api/v1/mdata/drivers with NO limit. That endpoint defaults limit=50, ORDER BY created_at DESC — so with
 * 91 active TRANSP drivers it returned only the 50 most-recently-created, and an active driver created before
 * that window (Fernando Mecor Hernandez) silently vanished from the picker (which filters client-side, no
 * network-on-type). Fix: every client-side driver picker now passes limit:200 (full active set).
 *
 * This test seeds > the 50 default (with an OLDEST-created "Mecor"), and proves: default-50 DROPS Mecor,
 * while the picker's limit=200 returns the COMPLETE active non-deactivated TRANSP set WITH Mecor present.
 * Mirrors the drivers list endpoint query exactly. Runs only in CI (migrated Postgres); harness copied from
 * accounting/__tests__/bill-expense-lines-rls.db.test.ts.
 */

import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("driver picker — full active set, no 50-cap (real Postgres)", () => {
  let db: pg.Client;
  let companyId: string;
  const suffix = randomUUID().slice(0, 8);
  const SEED_COUNT = 55; // > default 50
  const ids: string[] = [];
  const mecorId = randomUUID();

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

  // the exact drivers-list-endpoint query (status=Active, OCI, not deactivated, ORDER BY created_at DESC)
  async function listActive(limit: number): Promise<Array<{ id: string; last_name: string }>> {
    const res = await db.query<{ id: string; last_name: string }>(
      `SELECT id::text, last_name FROM mdata.drivers
       WHERE operating_company_id = $1::uuid AND status = 'Active'::mdata.driver_status AND deactivated_at IS NULL
       ORDER BY created_at DESC LIMIT $2::int OFFSET 0`,
      [companyId, limit]
    );
    return res.rows;
  }

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");

    await withBypass(async () => {
      // 54 recent active drivers + "Mecor" as the OLDEST created (so created_at DESC pushes him past row 50).
      for (let i = 0; i < SEED_COUNT - 1; i++) {
        const id = randomUUID();
        ids.push(id);
        await db.query(
          `INSERT INTO mdata.drivers (id, operating_company_id, first_name, last_name, phone, status, created_at)
           VALUES ($1::uuid,$2::uuid,$3,$4,$5,'Active'::mdata.driver_status, now() - ($6 || ' minutes')::interval)`,
          [id, companyId, `Seed${i}`, `Cap${suffix}${String(i).padStart(2, "0")}`, `+1999${suffix}${String(i).padStart(2, "0")}`, String(i)]
        );
      }
      ids.push(mecorId);
      await db.query(
        `INSERT INTO mdata.drivers (id, operating_company_id, first_name, last_name, phone, status, created_at)
         VALUES ($1::uuid,$2::uuid,'Fernando','MecorHernandez-${suffix}',$3,'Active'::mdata.driver_status, now() - interval '5000 minutes')`,
        [mecorId, companyId, `+1888${suffix}00`]
      );
    });
  });

  afterAll(async () => {
    if (!db) return;
    await withBypass(async () => {
      await db.query(`DELETE FROM mdata.drivers WHERE id = ANY($1::uuid[])`, [ids]);
    }).catch(() => {});
    await db.end().catch(() => {});
  });

  it("default limit=50 DROPS the oldest active driver (reproduces the bug)", async () => {
    const rows = await withBypass(() => listActive(50));
    expect(rows.length).toBe(50); // capped
    expect(rows.some((r) => r.id === mecorId)).toBe(false); // Mecor (oldest) excluded by the 50-cap
  });

  it("picker limit=200 returns the COMPLETE active set INCLUDING Mecor (the fix)", async () => {
    const rows = await withBypass(() => listActive(200));
    const seeded = rows.filter((r) => r.id === mecorId || ids.includes(r.id));
    expect(seeded.length).toBe(SEED_COUNT); // all seeded active drivers present
    expect(rows.some((r) => r.id === mecorId)).toBe(true); // the previously-missing driver is now selectable
  });
});
