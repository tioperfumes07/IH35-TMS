/**
 * Owner 2026-11-27 15:47 CT: "in supplier profiles, it is the same thing as vendors profiles right?" — one record: the
 * supplier's profile shows its company in Contacts. An unlinked supplier is offered the Contacts companies whose name
 * matches, for a one-click link; nothing is linked on its own. Real Postgres, one transaction rolled back.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { matchKey, setVendorCompany, vendorProfile } from "./profiles.service.js";

describe("matchKey", () => {
  it("drops brackets, what follows a dash, company endings and punctuation", () => {
    expect(matchKey("Broadway (wholesale competition)")).toBe("BROADWAY");
    expect(matchKey("Fragrance Secret, Inc.")).toBe("FRAGRANCESECRET");
    expect(matchKey("Elegance Distributors — ARABIC list")).toBe("ELEGANCEDISTRIBUTORS");
    expect(matchKey("Victory International")).toBe("VICTORY");
  });
});

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
describeIntegration("supplier profile → company suggestions (real Postgres, rolled back)", () => {
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
  const company = async (name: string) => (await db.query<{ id: string }>(
    `INSERT INTO perfume.contact_companies (name, role, source) VALUES ($1, 'vendor', 'SUGGESTTEST') RETURNING id`, [name])).rows[0].id;

  it("offers the matching companies, exact first; a short name of 3 letters offers nothing; a linked supplier offers none", async () => {
    const exact = await company("Zzqx Fragrance Secret Inc.");
    const wider = await company("Zzqx Fragrance Secret Miami Warehouse");
    await company("Unrelated Zzqx Beauty");
    const v = (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, short_name, kind) VALUES ('Zzqx Fragrance Secret, Inc.', 'ZQX', 'buy') RETURNING id`)).rows[0].id;
    const p = await vendorProfile(db as never, v);
    expect(p.company).toBeNull();
    expect(p.suggestions.map((s) => s["id"])).toEqual([exact, wider]);
    await setVendorCompany(db as never, v, exact);
    const linked = await vendorProfile(db as never, v);
    expect(linked.company?.["id"]).toBe(exact);
    expect(linked.suggestions).toEqual([]);
    // Nothing was linked on its own: only the owner's call above set company_id.
    const other = (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, short_name, kind) VALUES ('Zzq', 'ZZQ', 'buy') RETURNING id`)).rows[0].id;
    expect((await vendorProfile(db as never, other)).suggestions).toEqual([]);
  });
});
