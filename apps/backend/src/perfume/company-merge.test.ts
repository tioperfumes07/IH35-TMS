/** Owner 16:32 CT: one company, many contacts. Duplicate companies merge into one; the others are kept as its locations. */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { companyLocations, duplicateGroups, mergeDuplicateGroups } from "./company-merge.service.js";

describe.skipIf(process.env.GITHUB_ACTIONS !== "true")("company merge (real Postgres, rolled back)", () => {
  let db: pg.Client;
  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL!));
    await db.connect(); await db.query("BEGIN"); await db.query("SET LOCAL app.bypass_rls = 'lucia'");
  });
  afterAll(async () => { await db?.query("ROLLBACK").catch(() => {}); await db?.end().catch(() => {}); });

  it("3 'ZZ Van Cam' records → one company with all 3 salespeople, vendor + customer = both, 2 locations, history", async () => {
    const mk = async (name: string, role: string, city: string, phone: string | null) => (await db.query<{ id: string }>(
      `INSERT INTO perfume.contact_companies (name, source, role, city, phone) VALUES ($1, 'test', $2, $3, $4) RETURNING id::text`, [name, role, city, phone])).rows[0]!.id;
    const a = await mk("ZZ Van Cam", "vendor", "Miami", null);
    const b = await mk("ZZ Van Cam LLC", "customer", "Doral", "+1 305 111 2222");
    const c3 = await mk("ZZ VAN CAM, Inc.", "vendor", "Laredo", null);
    for (const [co, person] of [[a, "Ana Sales"], [b, "Beto Sales"], [c3, "Carla Sales"]] as const) {
      await db.query(`INSERT INTO perfume.contact_people (company_id, name) VALUES ($1::uuid, $2)`, [co, person]);
    }
    await db.query(`INSERT INTO perfume.contact_people (company_id, name) VALUES ($1::uuid, 'Ana Two')`, [a]); // a has the most people → stays
    const g = (await duplicateGroups(db)).find((x) => [x.keep.id, ...x.merge.map((m) => m.id)].includes(a))!;
    expect(g).toMatchObject({ companies: 3, keep: { id: a } });
    const r = await mergeDuplicateGroups(db as never, TEST_OWNER_USER_ID, [g.key]);
    expect(r).toMatchObject({ groups: 1, merged: 2, kept: [a] });
    const people = (await db.query(`SELECT name FROM perfume.contact_people WHERE company_id = $1 ORDER BY name`, [a])).rows.map((x) => x.name);
    expect(people).toEqual(["Ana Sales", "Ana Two", "Beto Sales", "Carla Sales"]);
    const keep = (await db.query(`SELECT role, phone, archived_at FROM perfume.contact_companies WHERE id = $1`, [a])).rows[0];
    expect(keep).toMatchObject({ role: "both", phone: "+1 305 111 2222", archived_at: null });
    expect((await companyLocations(db, a)).map((l) => l.city).sort()).toEqual(["Doral", "Laredo"]);
    expect((await db.query(`SELECT count(*)::int n FROM perfume.contact_companies WHERE id = ANY($1::uuid[]) AND archived_at IS NOT NULL AND merged_into_id = $2`, [[b, c3], a])).rows[0]!.n).toBe(2);
    const h = (await db.query(`SELECT action FROM perfume.lead_events WHERE action IN ('merged_into', 'merged_from') AND company_id = $1 ORDER BY action`, [a])).rows.map((x) => x.action);
    expect(h).toEqual(["merged_from", "merged_into", "merged_into"]);
    expect((await duplicateGroups(db)).find((x) => x.key === g.key)).toBeUndefined(); // nothing left to merge
  });
});
