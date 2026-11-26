/**
 * PERFUME-TRADE-SHOWS on real Postgres, rolled back (owner 2026-11-26 15:56 CT: "i am still missing all the other views"):
 * an import run twice never doubles a show and never clears the owner's "I go"; a contact is linked once per show and its
 * meeting can be booked; nothing is deleted (archived).
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { importRecords, importRecordSchema } from "./contacts.import.js";
import { addShowContact, listShowContacts, listShows, saveShow, setIGo, showSchema, showsOfCompany, updateShowContact } from "./trade-shows.service.js";

describe("show shape", () => {
  it("needs a name; dates are YYYY-MM-DD", () => {
    expect(showSchema.safeParse({ name: "" }).success).toBe(false);
    expect(showSchema.safeParse({ name: "TFWA World", starts_on: "10/04/2027" }).success).toBe(false);
    expect(showSchema.parse({ name: "TFWA World", starts_on: "2027-10-04", city: "" }).city).toBeNull();
  });
});

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
describeIntegration("trade show planner (real Postgres, rolled back)", () => {
  let db: pg.Client;
  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL!));
    await db.connect();
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
  });
  afterAll(async () => {
    await db?.query("ROLLBACK").catch(() => {});
    await db?.end().catch(() => {});
  });

  it("imports once, keeps I go, links a contact once, books the meeting", async () => {
    const show = { name: "TFWA World Exhibition & Conference", starts_on: "2027-10-03", ends_on: "2027-10-07", city: "Cannes, France", kind: "Duty free", i_go: true };
    const a = await saveShow(db as never, TEST_OWNER_USER_ID, showSchema.parse(show));
    expect(a.created).toBe(true);
    // The same show again (the calendar imported twice) is matched; "I go" stays the owner's.
    const b = await saveShow(db as never, TEST_OWNER_USER_ID, showSchema.parse({ ...show, i_go: false, venue: "Palais des Festivals" }));
    expect([b.id, b.created]).toEqual([a.id, false]);
    let row = (await listShows(db as never)).find((s) => s.id === a.id)!;
    expect([row.i_go, row.venue]).toEqual([true, "Palais des Festivals"]);
    await setIGo(db as never, a.id, false);
    expect((await listShows(db as never)).find((s) => s.id === a.id)!.i_go).toBe(false);

    await importRecords(db as never, [importRecordSchema.parse({ people: [{ name: "Kanak", email: "kanak@tradeshowtest.com" }], origins: [],
      company: { name: "TRADESHOWTEST PERFUMES", domain: "tradeshowtest.com", source: "Master Database", role: "vendor" } })], TEST_OWNER_USER_ID);
    const co = (await db.query<{ id: string }>(`SELECT id FROM perfume.contact_companies WHERE domain = 'tradeshowtest.com'`)).rows[0]!;
    const x1 = await addShowContact(db as never, TEST_OWNER_USER_ID, a.id, { company_id: co.id });
    const x2 = await addShowContact(db as never, TEST_OWNER_USER_ID, a.id, { company_id: co.id, booth: "R7.B12" });
    expect(x2.id).toBe(x1.id);
    await updateShowContact(db as never, x1.id, { status: "meeting_booked", meeting_at: "2027-10-04T15:00:00+02:00" });
    const list = await listShowContacts(db as never, a.id);
    expect(list.map((r) => [r.company, r.status, r.booth])).toEqual([["TRADESHOWTEST PERFUMES", "meeting_booked", "R7.B12"]]);
    row = (await listShows(db as never)).find((s) => s.id === a.id)!;
    expect([row.contacts, row.meetings]).toEqual([1, 1]);
    expect((await showsOfCompany(db as never, co.id)).map((s) => s.name)).toEqual(["TFWA World Exhibition & Conference"]);
    // Removed from the show = archived, kept on file.
    await updateShowContact(db as never, x1.id, { archived: true });
    expect(await listShowContacts(db as never, a.id)).toEqual([]);
    expect((await db.query(`SELECT count(*)::int AS n FROM perfume.trade_show_contacts WHERE id = $1`, [x1.id])).rows[0].n).toBe(1);
  });
});
