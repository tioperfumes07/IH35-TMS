/**
 * PERFUME owner wall, once per query (migration 202616970100, owner 2026-11-26 23:23 CT "COULDNT LOAD THE ITEM FILE"): the policy is
 * now (SELECT perfume.is_owner()) — the same rule. As the app role, a user who is not the desk owner sees no perfume row and cannot
 * write one; the desk owner sees it. Real Postgres, one transaction rolled back.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";

const OTHER = "a0000000-0000-4000-8000-00000000c0e1";
const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
describeIntegration("perfume owner policy (app role, rolled back)", () => {
  let db: pg.Client;
  let item = "";
  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL!));
    await db.connect();
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query(`INSERT INTO identity.users (id, email, role, preferred_language) VALUES ($1, 'not.owner@test.invalid', 'Dispatcher', 'en') ON CONFLICT (id) DO NOTHING`, [OTHER]);
    await db.query(`INSERT INTO perfume.desk_users (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [TEST_OWNER_USER_ID]);
    item = (await db.query<{ id: string }>(
      `INSERT INTO perfume.items (brand, name, size_ml, conc, gender, identity_key, loose_key, display_name) VALUES ('ZZP', 'WALL', 100, 'EDP', 'M', 'ZZP|WALL|100|EDP|M|', 'x', 'ZZP · WALL') RETURNING id`)).rows[0].id;
    await db.query("SET LOCAL app.bypass_rls = ''");
    await db.query("SET LOCAL ROLE ih35_app");
  });
  afterAll(async () => {
    await db?.query("ROLLBACK").catch(() => {});
    await db?.end().catch(() => {});
  });

  it("the policies are in the once-per-query form", async () => {
    const r = await db.query<{ qual: string; n: number }>(`SELECT qual, count(*)::int AS n FROM pg_policies WHERE schemaname = 'perfume' AND tablename <> 'desk_users' GROUP BY 1`);
    expect(r.rows.map((x) => x.qual)).toEqual(["( SELECT perfume.is_owner() AS is_owner)"]);
    expect(r.rows[0]!.n).toBeGreaterThanOrEqual(57);
  });
  it("not the desk owner: sees nothing, writes nothing; the desk owner sees the row", async () => {
    await db.query(`SELECT set_config('app.current_user_id', $1, true)`, [OTHER]);
    expect((await db.query(`SELECT id FROM perfume.items WHERE id = $1`, [item])).rowCount).toBe(0);
    await db.query("SAVEPOINT w");
    await expect(db.query(`INSERT INTO perfume.item_events (item_id, kind) VALUES ($1, 'edited')`, [item])).rejects.toThrow();
    await db.query("ROLLBACK TO SAVEPOINT w");
    await db.query(`SELECT set_config('app.current_user_id', $1, true)`, [TEST_OWNER_USER_ID]);
    expect((await db.query(`SELECT id FROM perfume.items WHERE id = $1`, [item])).rowCount).toBe(1);
  });
});
