/** Owner 2026-11-28 14:05 CT: add / change / remove the people of a company from its profile. Real Postgres, rolled back. */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { addPerson, CompanyPeopleError, personSchema, removePerson, updatePerson } from "./company-people.service.js";
import { companyHistory } from "./leads.events.js";

describe.skipIf(process.env.GITHUB_ACTIONS !== "true")("company people (real Postgres, rolled back)", () => {
  let db: pg.Client;
  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL!));
    await db.connect(); await db.query("BEGIN"); await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("SET LOCAL ROLE ih35_app"); // the app's own grants, as production
  });
  afterAll(async () => { await db?.query("ROLLBACK").catch(() => {}); await db?.end().catch(() => {}); });

  it("10 people on one company: add, change, refuse a used email, remove — each in the company history", async () => {
    const co = (await db.query<{ id: string }>(`INSERT INTO perfume.contact_companies (name, source, role) VALUES ('ZZ People Co', 'test', 'customer') RETURNING id::text`)).rows[0]!.id;
    const other = (await db.query<{ id: string }>(`INSERT INTO perfume.contact_companies (name, source, role) VALUES ('ZZ Other Co', 'test', 'vendor') RETURNING id::text`)).rows[0]!.id;
    const ids: string[] = [];
    for (let i = 1; i <= 10; i++) {
      const r = await addPerson(db as never, TEST_OWNER_USER_ID, co, personSchema.parse({ name: `Person ${i}`, email: `ZZ.Person${i}@Example.com`, phones: [`(305) 555-01${String(i).padStart(2, "0")}`] }));
      ids.push(r.person.id);
    }
    expect((await db.query(`SELECT count(*)::int n FROM perfume.contact_people WHERE company_id = $1 AND archived_at IS NULL`, [co])).rows[0]!.n).toBe(10);
    expect((await db.query(`SELECT email FROM perfume.contact_people WHERE id = $1`, [ids[0]])).rows[0]!.email).toBe("zz.person1@example.com");

    const up = await updatePerson(db as never, TEST_OWNER_USER_ID, ids[0]!, personSchema.parse({ name: "Brian Oberlender", title: "Buyer", email: "zz.person1@example.com", other_emails: ["zz.brian@yahoo.com"], phones: ["(305) 555-0101"] }));
    expect(up.changed.sort()).toEqual(["name", "other_emails", "title"]);

    const e = await addPerson(db as never, TEST_OWNER_USER_ID, other, personSchema.parse({ name: "Copy", email: "zz.person2@example.com" })).catch((x) => x);
    expect(e).toBeInstanceOf(CompanyPeopleError);
    expect((e as CompanyPeopleError).code).toBe("email_in_use");
    expect((e as Error).message).toContain("ZZ People Co");

    await removePerson(db as never, TEST_OWNER_USER_ID, ids[9]!, "left the company");
    expect((await db.query(`SELECT count(*)::int n FROM perfume.contact_people WHERE company_id = $1 AND archived_at IS NULL`, [co])).rows[0]!.n).toBe(9);
    const acts = (await companyHistory(db as never, co)).map((h: { action: string }) => h.action);
    expect(acts.filter((a) => a === "person_added")).toHaveLength(10);
    expect(acts).toContain("person_changed");
    expect(acts).toContain("person_removed");
    expect(() => personSchema.parse({})).toThrow(); // a person needs a name, an email or a phone
  });
});
