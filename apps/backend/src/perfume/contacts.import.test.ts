/**
 * PERFUME-CONTACTS import (research session ROUND P1.4 #6-7, P1.6) on real Postgres, rolled back: same web domain joins one
 * company; vendor + customer merges to both; blanks filled, values on file kept; one email = one person; two different INEGI
 * DENUE ids never merge (two "Sin Nombre" depots on one street), but a DENUE row merges into a Master company by phone.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { importRecords, importRecordSchema, type ImportRecord } from "./contacts.import.js";

const rec = (r: Partial<ImportRecord> & { company: Partial<ImportRecord["company"]> }): ImportRecord =>
  importRecordSchema.parse({ people: [], origins: [], ...r, company: { source: "Master Database", ...r.company } });

describe("import record shape", () => {
  it("rejects a record with no name or a bad role, accepts the Master shape", () => {
    expect(importRecordSchema.safeParse({ company: { name: "", source: "x" }, people: [] }).success).toBe(false);
    expect(importRecordSchema.safeParse({ company: { name: "A", source: "x", role: "partner" }, people: [] }).success).toBe(false);
    expect(rec({ company: { name: "Perfume Center", domain: "perfume-center.com", role: "both" } }).company.name).toBe("Perfume Center");
  });
});

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
describeIntegration("import into the contacts database (real Postgres, rolled back)", () => {
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

  it("dedupes, merges roles, fills blanks, keeps one person per email, and keeps DENUE ids apart", async () => {
    const t = await importRecords(db as never, [
      rec({ company: { name: "IMPTEST Perfume Center", domain: "imptest-pc.com", role: "vendor", first_contact_on: "2016-01-18", last_email_on: "2026-04-17" },
        people: [{ name: "Ronak", email: "ronak@imptest-pc.com", phones: [] }],
        origins: [{ person_index: 0, occurred_on: "2016-01-18", how: "Email", source: "TIO mailboxes" }] }),
      rec({ company: { name: "IMPTEST Perfume Center", domain: "imptest-pc.com", role: "customer", website: "imptest-pc.com", first_contact_on: "2014-08-19", last_email_on: "2026-11-25" },
        people: [{ name: "Lakshmi", email: "lakshmi@imptest-pc.com", phones: ["+1 (516) 555-0101"] }, { name: "Ronak again", email: "ronak@imptest-pc.com" }],
        origins: [{ person_index: 0, occurred_on: "2014-08-19", how: "Email", source: "TIO mailboxes" }, { person_index: 0, how: "Kumar list", source: "Kumar list (Desktop)" }] }),
      rec({ company: { name: "Sin Nombre", city: "IMPTEST City", source: "INEGI DENUE", external_source: "INEGI DENUE", external_directory_id: "imp-1", phone: "8670000001" } }),
      rec({ company: { name: "Sin Nombre", city: "IMPTEST City", source: "INEGI DENUE", external_source: "INEGI DENUE", external_directory_id: "imp-2", phone: "8670000001" } }),
      rec({ company: { name: "Sin Nombre", city: "IMPTEST City", source: "INEGI DENUE", external_source: "INEGI DENUE", external_directory_id: "imp-1" } }),
      rec({ company: { name: "IMPTEST La Rosa", city: "Nuevo Laredo", source: "INEGI DENUE", external_source: "INEGI DENUE", external_directory_id: "imp-3", phone: "(516) 555-0101", segment: "Perfume & cosmetics wholesale" } }),
    ], TEST_OWNER_USER_ID);
    expect([t.records, t.inserted, t.matched]).toEqual([6, 3, 3]);
    expect(t.by).toEqual({ email: 1, "outside key": 1, phone: 1 }); // Ronak's email comes before the domain in the key order
    expect([t.people_inserted, t.people_existing]).toEqual([2, 1]);

    const pc = (await db.query(`SELECT id, role, website, first_contact_on::text AS f, last_email_on::text AS l, external_directory_id, segment
      FROM perfume.contact_companies WHERE domain = 'imptest-pc.com'`)).rows;
    expect(pc).toHaveLength(1);
    expect([pc[0].role, pc[0].website, pc[0].f, pc[0].l]).toEqual(["both", "imptest-pc.com", "2014-08-19", "2026-11-25"]);
    // The DENUE row with the same phone as Lakshmi merged into the Master company and took its outside key.
    expect([pc[0].external_directory_id, pc[0].segment]).toEqual(["imp-3", "Perfume & cosmetics wholesale"]);
    expect((await db.query(`SELECT count(*)::int AS n FROM perfume.contact_people WHERE company_id = $1`, [pc[0].id])).rows[0].n).toBe(2);
    expect((await db.query(`SELECT how FROM perfume.contact_origins WHERE company_id = $1 ORDER BY occurred_on NULLS LAST, how`, [pc[0].id])).rows.map((r) => r.how))
      .toEqual(["Email", "Email", "Kumar list"]);
    // A phone-only person seen again (another source, phone written differently) is the same person — never twice.
    const again = await importRecords(db as never, [
      rec({ company: { name: "IMPTEST Phone Only Co", source: "Master Database" }, people: [{ name: "Juan Phone", phones: ["+52 867 555 0199"] }] }),
      rec({ company: { name: "IMPTEST Phone Only Co", source: "Phone contacts" }, people: [{ name: "Juan P.", phones: ["(867) 555-0199"] }] }),
    ], TEST_OWNER_USER_ID);
    expect([again.inserted, again.matched, again.people_inserted, again.people_existing]).toEqual([1, 1, 1, 1]);
    // Two "Sin Nombre" depots with different DENUE ids stay two, even with one phone and one name; the same id again is one.
    expect((await db.query(`SELECT count(*)::int AS n FROM perfume.contact_companies WHERE name = 'Sin Nombre' AND city = 'IMPTEST City'`)).rows[0].n).toBe(2);
  });

  it("a person already on file gets blanks filled from the email signature, nothing overwritten (owner 2026-11-28 15:01 CT)", async () => {
    await importRecords(db as never, [rec({ company: { name: "IMPTEST Sig Co", domain: "imptest-sig.com" }, people: [{ name: "Parvin", email: "parvin@imptest-sig.com" }] })], TEST_OWNER_USER_ID);
    await importRecords(db as never, [rec({ company: { name: "IMPTEST Sig Co", domain: "imptest-sig.com", phone: "212-327-0555", address: "2300 Marcus Ave, Suite C, New Hyde Park, NY 11042", website: "www.imptest-sig.com" },
      people: [{ name: "Parvinder Saini", title: "Buying / Sales Manager", email: "parvin@imptest-sig.com", phones: ["+1 (917) 292-9269"] }] })], TEST_OWNER_USER_ID);
    const p = (await db.query(`SELECT name, title, phones FROM perfume.contact_people WHERE email = 'parvin@imptest-sig.com'`)).rows;
    expect(p).toEqual([{ name: "Parvin", title: "Buying / Sales Manager", phones: ["+1 (917) 292-9269"] }]);
    const co = (await db.query(`SELECT phone, address, website FROM perfume.contact_companies WHERE domain = 'imptest-sig.com'`)).rows;
    expect(co).toEqual([{ phone: "212-327-0555", address: "2300 Marcus Ave, Suite C, New Hyde Park, NY 11042", website: "www.imptest-sig.com" }]);
  });

  it("an email on file wins over a phone shared with another company (owner 2026-11-28)", async () => {
    await importRecords(db as never, [
      rec({ company: { name: "IMPTEST Spectrum", phone: "+1 (201) 555-0815" } }),
      rec({ company: { name: "IMPTEST Perfumora", domain: "imptest-perfumora.com" }, people: [{ email: "sales@imptest-perfumora.com" }] }),
    ], TEST_OWNER_USER_ID);
    const t = await importRecords(db as never, [rec({ company: { name: "Spectrum NJ LLC", phone: "+1 (201) 555-0815", address: "200 Roosevelt Pl, Palisades Park, NJ 07650" },
      people: [{ email: "sales@imptest-perfumora.com", phones: ["+1 (201) 555-0815"] }] })], TEST_OWNER_USER_ID);
    expect(t.by).toEqual({ email: 1 });
    const rows = (await db.query(`SELECT name, address FROM perfume.contact_companies WHERE name IN ('IMPTEST Spectrum', 'IMPTEST Perfumora') ORDER BY name`)).rows;
    expect(rows).toEqual([{ name: "IMPTEST Perfumora", address: "200 Roosevelt Pl, Palisades Park, NJ 07650" }, { name: "IMPTEST Spectrum", address: null }]);
  });
});
