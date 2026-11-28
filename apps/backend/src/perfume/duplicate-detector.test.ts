/** Owner 17:17 CT: automatic duplicate detector with recommendations; the owner confirms or dismisses. */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { confirmDuplicates, dismissDuplicates, listRecommendations, scanDuplicates } from "./duplicate-detector.service.js";

describe.skipIf(process.env.GITHUB_ACTIONS !== "true")("duplicate detector (real Postgres, rolled back)", () => {
  let db: pg.Client;
  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL!));
    await db.connect(); await db.query("BEGIN"); await db.query("SET LOCAL app.bypass_rls = 'lucia'");
  });
  afterAll(async () => { await db?.query("ROLLBACK").catch(() => {}); await db?.end().catch(() => {}); });

  it("same name, typo, same phone → recommendations with reasons; dismissed never returns; confirm merges", async () => {
    const mk = async (name: string, phone: string | null, city: string | null) => (await db.query<{ id: string }>(
      `INSERT INTO perfume.contact_companies (name, source, role, phone, city) VALUES ($1, 'test', 'vendor', $2, $3) RETURNING id::text`, [name, phone, city])).rows[0]!.id;
    const a = await mk("Zqx Fragrance Worldwide LLC", "+1 (305) 555-0101", "Miami");
    const b = await mk("Zqx Fragrance Worldwide", null, "Doral");
    const t = await mk("Zqx Fragance Worldwid", "305.555.0101", "Miami");
    const far = await mk("Totally Different Shoes", null, null);
    await db.query(`INSERT INTO perfume.contact_people (company_id, name) VALUES ($1::uuid, 'Rep One'), ($1::uuid, 'Rep Two')`, [b]);
    await scanDuplicates(db);
    const mine = (await listRecommendations(db)).rows.filter((r) => [a, b, t].includes(r.a.id) && [a, b, t].includes(r.b.id));
    const pair = (x: string, y: string) => mine.find((r) => (r.a.id === x && r.b.id === y) || (r.a.id === y && r.b.id === x));
    expect(pair(a, b)).toMatchObject({ reasons: ["same_name"], score: 1 });
    expect(pair(a, t)!.reasons).toEqual(expect.arrayContaining(["similar_name", "same_phone"]));
    expect((await listRecommendations(db)).rows.some((r) => r.a.id === far || r.b.id === far)).toBe(false);
    // b has 2 people → b is the recommended company to keep.
    const ab = pair(a, b)!;
    expect(ab.keep === "a" ? ab.a.id : ab.b.id).toBe(b);
    // Dismiss a–t: never suggested again after a new scan.
    await dismissDuplicates(db as never, TEST_OWNER_USER_ID, [pair(a, t)!.id]);
    await scanDuplicates(db);
    expect((await listRecommendations(db)).rows.find((r) => r.id === pair(a, t)!.id)).toBeUndefined();
    // Confirm a–b: a becomes a location of b; its recommendation with t closes as gone.
    expect(await confirmDuplicates(db as never, TEST_OWNER_USER_ID, [ab.id])).toMatchObject({ merged: 1 });
    expect((await db.query(`SELECT merged_into_id::text FROM perfume.contact_companies WHERE id = $1`, [a])).rows[0]!.merged_into_id).toBe(b);
    expect((await db.query(`SELECT status FROM perfume.duplicate_candidates WHERE id = $1`, [ab.id])).rows[0]!.status).toBe("merged");
  });

  it("owner 18:21 CT: B&S Group / B&S Global / B&S Brand Distribution BV (B&S Group); same person on a typo domain", async () => {
    const mk = async (name: string, role: string | null) => (await db.query<{ id: string }>(
      `INSERT INTO perfume.contact_companies (name, source, role) VALUES ($1, 'test', $2) RETURNING id::text`, [name, role])).rows[0]!.id;
    const grp = await mk("Q&Z Group (distributor)", "vendor"), glb = await mk("Q&Z Global (distributor)", "vendor");
    const bv = await mk("Q&Z Brand Distribution BV (Q&Z Group)", "vendor");
    const t1 = await mk("Zqk Fragances Mayra", null), t2 = await mk("Zqkfragrances", "vendor");
    await db.query(`INSERT INTO perfume.contact_people (company_id, name, email) VALUES ($1::uuid, 'Mayra', 'mayra@zqkfragances.com'), ($2::uuid, 'Mayra', 'mayra@zqkfragrances.com')`, [t1, t2]);
    await scanDuplicates(db);
    const all = (await listRecommendations(db, { limit: 5000 })).rows;
    const pair = (x: string, y: string) => all.find((r) => (r.a.id === x && r.b.id === y) || (r.a.id === y && r.b.id === x));
    expect(pair(grp, bv)?.reasons).toEqual(expect.arrayContaining(["same_core_name"]));
    expect(pair(grp, glb)?.reasons).toEqual(expect.arrayContaining(["same_brand_initials"]));
    expect(pair(t1, t2)?.reasons).toEqual(expect.arrayContaining(["same_contact_similar_domain"]));
  });
});
