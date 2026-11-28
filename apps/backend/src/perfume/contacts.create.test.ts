/** Owner 18:21 CT: Create vendor / customer goes through the import engine — the second create of the same company finds the first. */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { emptyTally, importRecords, importRecordSchema } from "./contacts.import.js";

describe.skipIf(process.env.GITHUB_ACTIONS !== "true")("create company (real Postgres, rolled back)", () => {
  let db: pg.Client;
  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL!));
    await db.connect(); await db.query("BEGIN"); await db.query("SET LOCAL app.bypass_rls = 'lucia'");
  });
  afterAll(async () => { await db?.query("ROLLBACK").catch(() => {}); await db?.end().catch(() => {}); });

  it("creates the vendor with its person; the same name again returns the same company (no second record)", async () => {
    const rec = importRecordSchema.parse({
      company: { name: "Zqv Created Vendor LLC", role: "vendor", source: "Created in app", vendor_type: "Distributor", phone: "305 555 0199" },
      people: [{ name: "Ana Rep", email: "ana@zqvcreated.com", phones: [], role: "vendor" }],
      origins: [{ how: "Created in app", source: "Vendors · Create vendor" }],
    });
    const run = async () => { let id: string | null = null, ins = false; await importRecords(db as unknown as pg.PoolClient, [rec], TEST_OWNER_USER_ID, emptyTally(), (c, i) => { id = c; ins = i; }); return { id, ins }; };
    const first = await run();
    expect(first.ins).toBe(true);
    const row = (await db.query(`SELECT name, role, vendor_type, (SELECT count(*)::int FROM perfume.contact_people p WHERE p.company_id = c.id) AS people FROM perfume.contact_companies c WHERE id = $1::uuid`, [first.id])).rows[0];
    expect(row).toEqual({ name: "Zqv Created Vendor LLC", role: "vendor", vendor_type: "Distributor", people: 1 });
    const again = await run();
    expect(again).toEqual({ id: first.id, ins: false });
  });
});
