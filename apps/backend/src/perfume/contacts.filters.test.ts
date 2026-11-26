/**
 * Owner 2026-11-26 15:56 CT: "the boxes are not drop down filter combobox so i can typ city etc." — the contacts list
 * filters by any of several countries / states / cities / categories / sources, and each box lists its values with counts.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { importRecords, importRecordSchema } from "./contacts.import.js";
import { contactFacets, listContacts } from "./contacts.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
describeIntegration("contacts filter boxes (real Postgres, rolled back)", () => {
  let db: pg.Client;
  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL!));
    await db.connect();
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    await db.query("UPDATE perfume.contact_companies SET archived_at = now() WHERE archived_at IS NULL");
    const rec = (name: string, city: string, state: string, country: string, cat: string) =>
      importRecordSchema.parse({ people: [], origins: [], company: { name, city, state, country, main_category: cat, source: "FILTERTEST" } });
    await importRecords(db as never, [rec("ZZ Rosa", "Nuevo Laredo", "Tamps.", "MX", "Perfume"), rec("ZZ Sol", "Laredo", "TX", "US", "Duty free"),
      rec("ZZ Luna", "Laredo", "TX", "US", "Perfume")], TEST_OWNER_USER_ID);
  });
  afterAll(async () => {
    await db?.query("ROLLBACK").catch(() => {});
    await db?.end().catch(() => {});
  });

  it("each box lists its values with counts; several picks in a box are OR, boxes together are AND", async () => {
    const f = await contactFacets(db as never, {});
    expect(f.city).toEqual(expect.arrayContaining([{ value: "Laredo", count: 2 }, { value: "Nuevo Laredo", count: 1 }]));
    expect(f.category).toEqual(expect.arrayContaining([{ value: "Perfume", count: 2 }]));
    expect((await listContacts(db as never, { cities: ["Laredo", "Nuevo Laredo"] })).total).toBe(3);
    expect((await listContacts(db as never, { cities: ["Laredo"], categories: ["Perfume"] })).rows.map((r) => r.name)).toEqual(["ZZ Luna"]);
    // A box's own pick never narrows its own list (the other cities stay pickable).
    expect((await contactFacets(db as never, { cities: ["Laredo"] })).city.map((x) => x.value)).toEqual(expect.arrayContaining(["Laredo", "Nuevo Laredo"]));
    expect((await contactFacets(db as never, { cities: ["Laredo"] })).country).toEqual([{ value: "US", count: 2 }]);
  });
});
