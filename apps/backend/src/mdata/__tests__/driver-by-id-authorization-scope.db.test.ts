/**
 * Driver by-id GET — company-authorization scope regression guard (real Postgres)
 *
 * LIVE BUG (behind frontend #1890): GET /api/v1/mdata/drivers/:id non-aggregate branch scoped the
 * driver ONLY to the caller's resolved default company via `AND operating_company_id = $2`, with NO
 * driver_company_authorizations fallback. A driver homed at company B but insurance-authorized to
 * the caller's company A therefore 404'd at the bare by-id read, even though buildDriverAggregate
 * (the same URL WITH operating_company_id) returns it. Fix: mirror the aggregate's scope —
 * `operating_company_id = $2 OR EXISTS(active dca where company_id = $2)`.
 *
 * This test seeds a driver homed at company B and authorizes it at company A, then proves:
 *   1. the OLD scope (home-company-only) DROPS the driver when scoped to A (reproduces the 404).
 *   2. the NEW scope (home OR active dca) RETURNS the driver when scoped to A (the fix → 200).
 *   3. an UNAUTHORIZED driver homed at B is still NOT returned when scoped to A (no leak → still 404).
 *   4. a driver homed at A (default-company path) is still returned by the NEW scope (no regression).
 *
 * Query strings mirror drivers.routes.ts GET /api/v1/mdata/drivers/:id EXACTLY. Runs only in CI
 * (migrated Postgres). Harness mirrors drivers-list-no-50-cap.db.test.ts.
 */

import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites, ensureSecondEntityLoad } from "../../../test-helpers/db-fixture.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("driver by-id GET — company-authorization scope (real Postgres)", () => {
  let db: pg.Client;
  let companyA: string; // caller's resolved (default) company
  let companyB: string; // driver's home company
  const suffix = randomUUID().slice(0, 8);

  const homedAtB_authorizedAtA = randomUUID();
  const homedAtB_unauthorized = randomUUID();
  const homedAtA = randomUUID();
  const seededDrivers = [homedAtB_authorizedAtA, homedAtB_unauthorized, homedAtA];

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

  // OLD (buggy) scope: home operating_company only.
  async function findOldScope(driverId: string, scopedCompanyId: string): Promise<boolean> {
    const res = await withBypass(() =>
      db.query(
        `SELECT id FROM mdata.drivers WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
        [driverId, scopedCompanyId]
      )
    );
    return res.rows.length === 1;
  }

  // NEW (fixed) scope: home operating_company OR active driver_company_authorizations — mirrors
  // drivers.routes.ts GET /api/v1/mdata/drivers/:id.
  async function findNewScope(driverId: string, scopedCompanyId: string): Promise<boolean> {
    const res = await withBypass(() =>
      db.query(
        `SELECT id FROM mdata.drivers
           WHERE id = $1::uuid
             AND (
               operating_company_id = $2::uuid
               OR EXISTS (
                 SELECT 1 FROM mdata.driver_company_authorizations dca
                 WHERE dca.driver_id = mdata.drivers.id
                   AND dca.company_id = $2::uuid
                   AND dca.is_authorized = true
                   AND dca.deactivated_at IS NULL
               )
             )
           LIMIT 1`,
        [driverId, scopedCompanyId]
      )
    );
    return res.rows.length === 1;
  }

  beforeAll(async () => {
    companyA = await ensureIntegrationPrerequisites();
    // Existing second-entity seed row (USMCA) — avoids inserting into org.companies (whose creation
    // trigger touches safety.safety_settings, which has no INSERT policy).
    companyB = (await ensureSecondEntityLoad()).companyId;
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");

    await withBypass(async () => {
      // Driver homed at B, authorized to A.
      await db.query(
        `INSERT INTO mdata.drivers (id, operating_company_id, first_name, last_name, phone, status)
         VALUES ($1::uuid,$2::uuid,'Auth','AtA-${suffix}',$3,'Active'::mdata.driver_status)`,
        [homedAtB_authorizedAtA, companyB, `+1777${suffix}01`]
      );
      await db.query(
        `INSERT INTO mdata.driver_company_authorizations (driver_id, company_id, is_authorized)
         VALUES ($1::uuid, $2::uuid, true)
         ON CONFLICT (driver_id, company_id) DO UPDATE SET is_authorized = true, deactivated_at = NULL`,
        [homedAtB_authorizedAtA, companyA]
      );

      // Driver homed at B, NOT authorized anywhere else.
      await db.query(
        `INSERT INTO mdata.drivers (id, operating_company_id, first_name, last_name, phone, status)
         VALUES ($1::uuid,$2::uuid,'Unauth','AtB-${suffix}',$3,'Active'::mdata.driver_status)`,
        [homedAtB_unauthorized, companyB, `+1777${suffix}02`]
      );

      // Driver homed at A (default-company path).
      await db.query(
        `INSERT INTO mdata.drivers (id, operating_company_id, first_name, last_name, phone, status)
         VALUES ($1::uuid,$2::uuid,'Home','AtA-${suffix}',$3,'Active'::mdata.driver_status)`,
        [homedAtA, companyA, `+1777${suffix}03`]
      );
    });
  });

  afterAll(async () => {
    if (!db) return;
    await withBypass(async () => {
      await db.query(`DELETE FROM mdata.driver_company_authorizations WHERE driver_id = ANY($1::uuid[])`, [seededDrivers]);
      await db.query(`DELETE FROM mdata.drivers WHERE id = ANY($1::uuid[])`, [seededDrivers]);
    }).catch(() => {});
    await db.end().catch(() => {});
  });

  it("OLD scope 404s a driver homed at B but authorized at A (reproduces the bug)", async () => {
    expect(await findOldScope(homedAtB_authorizedAtA, companyA)).toBe(false);
  });

  it("NEW scope RETURNS a driver homed at B but authorized at A (the fix → 200)", async () => {
    expect(await findNewScope(homedAtB_authorizedAtA, companyA)).toBe(true);
  });

  it("NEW scope still 404s an UNAUTHORIZED driver homed at B (no cross-entity leak)", async () => {
    expect(await findNewScope(homedAtB_unauthorized, companyA)).toBe(false);
  });

  it("NEW scope RETURNS a driver homed at A (default-company path unchanged, no regression)", async () => {
    expect(await findNewScope(homedAtA, companyA)).toBe(true);
  });
});
