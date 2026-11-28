/** Owner 2026-11-27 21:39 CT: delete the selected contacts that are not for the business; a company with business on file is kept. */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { deleteContacts, restoreContacts } from "./contact-delete.service.js";
import { listContacts } from "./contacts.service.js";

describe.skipIf(process.env.GITHUB_ACTIONS !== "true")("contact delete (real Postgres, rolled back)", () => {
  let db: pg.Client;
  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL!));
    await db.connect(); await db.query("BEGIN"); await db.query("SET LOCAL app.bypass_rls = 'lucia'");
  });
  afterAll(async () => { await db?.query("ROLLBACK").catch(() => {}); await db?.end().catch(() => {}); });

  it("deletes the junk contacts with their people, keeps the one with a quote, restores on request", async () => {
    const mk = async (name: string, role: string) => (await db.query<{ id: string }>(
      `INSERT INTO perfume.contact_companies (name, source, role) VALUES ($1, 'ZZDELTEST', $2) RETURNING id::text`, [name, role])).rows[0]!.id;
    const junk1 = await mk("ZZDel Pizza Place", "vendor"), junk2 = await mk("ZZDel Gym", "customer"), real = await mk("ZZDel Real Shop", "customer");
    await db.query(`INSERT INTO perfume.contact_people (company_id, name) VALUES ($1::uuid, 'Pat'), ($1::uuid, 'Lee')`, [junk1]);
    await db.query(`INSERT INTO perfume.vendors (name, kind, company_id) VALUES ('ZZDel Pizza Place', 'buy', $1::uuid)`, [junk1]);
    await db.query(`INSERT INTO perfume.quotes (company_id, customer_name) VALUES ($1::uuid, 'ZZDel Real Shop')`, [real]);

    const r = await deleteContacts(db, TEST_OWNER_USER_ID, [junk1, junk2, real]);
    expect(r).toMatchObject({ deleted: 2, people: 2, already_deleted: 0 });
    expect(r.kept).toEqual([{ id: real, name: "ZZDel Real Shop", reason: "has quotes" }]);
    const left = await listContacts(db as never, { q: "ZZDel", limit: 50, offset: 0 } as never);
    expect(left.rows.map((x: { id: string }) => x.id)).toEqual([real]);
    expect((await db.query(`SELECT 1 FROM perfume.vendors WHERE company_id = $1::uuid AND archived_at IS NULL`, [junk1])).rowCount).toBe(0);
    const ev = (await db.query<{ detail: { people: number } }>(`SELECT detail FROM perfume.lead_events WHERE company_id = $1::uuid AND action = 'deleted'`, [junk1])).rows;
    expect(ev).toEqual([{ detail: expect.objectContaining({ people: 2 }) }]);

    expect((await deleteContacts(db, TEST_OWNER_USER_ID, [junk1])).already_deleted).toBe(1);

    expect(await restoreContacts(db, TEST_OWNER_USER_ID, [junk1])).toEqual({ restored: 1 });
    expect((await db.query(`SELECT 1 FROM perfume.contact_people WHERE company_id = $1::uuid AND archived_at IS NULL`, [junk1])).rowCount).toBe(2);
    expect((await db.query(`SELECT 1 FROM perfume.vendors WHERE company_id = $1::uuid AND archived_at IS NULL`, [junk1])).rowCount).toBe(1);
  });
});
