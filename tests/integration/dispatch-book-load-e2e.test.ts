import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bookLoad } from "../../apps/backend/src/dispatch/book-load.service";
import { buildPgClientConfig } from "../../apps/backend/src/lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../apps/backend/test-helpers/constants";
import { ensureIntegrationPrerequisites } from "../../apps/backend/test-helpers/db-fixture";

// CI GUARD (2026-06-24) — write-side twin of #1444.
// book-load.service.ts INSERTed a `trailer_id` column into mdata.loads — a column that does NOT exist on
// mdata.loads in any migration nor in prod (GUARD live: loads_has_trailer_id=0). That 42703'd EVERY booking
// that reached the INSERT. The fix removes trailer_id from the lockstep INSERT and persists the selected
// trailer (an mdata.equipment id) via the REAL link dispatch.load_assignment_history.new_trailer_id.
// This test books a real load through the live bookLoad() path and asserts:
//   1. it returns kind:"ok" (no 42703) — proves the missing-column 500 is gone, and
//   2. the selected trailer is persisted to load_assignment_history.new_trailer_id (no data silently dropped).
// Old code → bookLoad() throws 42703 (red); fixed code → kind:"ok" + history row (green). CI-gated like the
// other integration e2es so the regression can never reach prod again.
const describeE2E = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeE2E("book-load — E2E (real DB, trailer_id write-side 500 guard)", () => {
  let client: pg.Client;
  let companyId: string;
  let customerId: string;
  let trailerId: string;
  const createdLoadIds: string[] = [];

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL required for book-load e2e");
    client = new pg.Client(buildPgClientConfig(cs));
    await client.connect();
    await client.query("SET ROLE ih35_app");
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const suffix = randomUUID().slice(0, 8);
    const cust = await client.query<{ id: string }>(
      `INSERT INTO mdata.customers (customer_name, operating_company_id) VALUES ($1, $2::uuid) RETURNING id`,
      [`BookLoad Trailer ${suffix}`, companyId]
    );
    customerId = cust.rows[0]!.id;
    // Trailer (mdata.equipment) owned by this operating company so the entity-scope check
    // COALESCE(currently_leased_to_company_id, owner_company_id) = operating_company_id passes.
    const trailer = await client.query<{ id: string }>(
      `INSERT INTO mdata.equipment (equipment_number, vin, equipment_type, owner_company_id)
       VALUES ($1, $2, 'DryVan', $3::uuid) RETURNING id`,
      [`TEST-TRL-${suffix}`, `TESTVIN${suffix}`, companyId]
    );
    trailerId = trailer.rows[0]!.id;
    await client.query("COMMIT");
  });

  afterAll(async () => {
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL app.bypass_rls = 'lucia'");
      for (const id of createdLoadIds) {
        await client.query(`DELETE FROM dispatch.load_assignment_history WHERE load_id = $1::uuid`, [id]);
        await client.query(`DELETE FROM mdata.loads WHERE id = $1::uuid`, [id]);
      }
      await client.query(`DELETE FROM mdata.equipment WHERE id = $1::uuid`, [trailerId]);
      await client.query(`DELETE FROM mdata.customers WHERE id = $1::uuid`, [customerId]);
      await client.query("COMMIT");
    } catch {
      await client.query("ROLLBACK").catch(() => {});
    } finally {
      await client.end().catch(() => {});
    }
  });

  it("books a load with a selected trailer and returns ok (no trailer_id 42703)", async () => {
    const result = await bookLoad({
      requestingUserUuid: TEST_OWNER_USER_ID,
      requestingUserRole: "owner",
      operating_company_id: companyId,
      customer_id: customerId,
      status: "unassigned",
      save_mode: "draft",
      assigned_trailer_unit_id: trailerId,
      charges: [],
      stops: [],
    });

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error(`book failed: ${JSON.stringify(result)}`);
    const loadId = String(result.row.id);
    expect(loadId).toMatch(/^[0-9a-f-]{36}$/);
    createdLoadIds.push(loadId);
  });

  it("persists the selected trailer to load_assignment_history.new_trailer_id (no silent data loss)", async () => {
    expect(createdLoadIds.length).toBeGreaterThan(0);
    const loadId = createdLoadIds[0]!;
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const rows = await client.query<{ new_trailer_id: string; assignment_method: string; new_unit_id: string | null }>(
      `SELECT new_trailer_id::text, assignment_method, new_unit_id::text
       FROM dispatch.load_assignment_history WHERE load_id = $1::uuid`,
      [loadId]
    );
    await client.query("ROLLBACK");
    const trailerRow = rows.rows.find((r) => r.new_trailer_id === trailerId);
    expect(trailerRow).toBeDefined();
    expect(trailerRow!.assignment_method).toBe("full_form");
    // Trailer-only row: new_unit_id NULL so dispatcher booking-gap analytics (JOIN on new_unit_id IS NOT NULL)
    // are unaffected.
    expect(trailerRow!.new_unit_id).toBeNull();
  });

  it("never writes a trailer_id column to mdata.loads (the column does not exist)", async () => {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const col = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.columns
       WHERE table_schema = 'mdata' AND table_name = 'loads' AND column_name = 'trailer_id'`
    );
    await client.query("ROLLBACK");
    expect(col.rows[0]!.n).toBe(0);
  });
});
