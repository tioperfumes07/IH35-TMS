/**
 * One company record (owner 2026-11-27 17:25 CT). Real Postgres, one transaction rolled back.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { applyVendorLinks, companyNameOf, setCompanyRole, vendorLinkPreview } from "./vendor-company.service.js";

describe("companyNameOf", () => {
  it("drops the list's own label", () => {
    expect(companyNameOf("Elegance Distributors — ARABIC list")).toBe("Elegance Distributors");
    expect(companyNameOf("Perfumes Plus Wholesale — BLACK FRIDAY specials (240+ each, thru Nov 30)")).toBe("Perfumes Plus Wholesale");
    expect(companyNameOf("Miami Trading Zone (MTZ)")).toBe("Miami Trading Zone");
    expect(companyNameOf("Perfumora / Spectrum NJ LLC")).toBe("Perfumora / Spectrum NJ LLC");
  });
});

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
describeIntegration("price-list vendors → one company in Contacts (real Postgres, rolled back)", () => {
  let db: pg.Client;
  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL!));
    await db.connect();
    await db.query("BEGIN");
    await db.query("SET LOCAL app.bypass_rls = 'lucia'");
    // Only this test's lists are unlinked in the preview it reads.
    await db.query(`UPDATE perfume.vendors SET archived_at = now() WHERE company_id IS NULL AND archived_at IS NULL`);
  });
  afterAll(async () => {
    await db?.query("ROLLBACK").catch(() => {});
    await db?.end().catch(() => {});
  });
  const company = async (name: string, role: string | null) => (await db.query<{ id: string }>(
    `INSERT INTO perfume.contact_companies (name, role, source) VALUES ($1, $2, 'LINKTEST') RETURNING id`, [name, role])).rows[0].id;
  const vendor = async (name: string, kind: string, short: string | null = null) => (await db.query<{ id: string }>(
    `INSERT INTO perfume.vendors (name, short_name, kind) VALUES ($1, $2, $3) RETURNING id`, [name, short, kind])).rows[0].id;

  it("two lists of one company → one company; a customer that sells to us becomes both; no match → a new company; one history row each", async () => {
    const zq = await company("Zqlink Distributors", "customer");
    const a = await vendor("Zqlink Distributors", "buy");
    const b = await vendor("Zqlink Distributors — ARABIC list", "buy");
    const n = await vendor("Zqnomatch Fragrance House (ZNM)", "buy");
    const pv = await vendorLinkPreview(db as never);
    const by = Object.fromEntries(pv.proposals.map((p) => [p.vendor_id, p]));
    expect(by[a]!.action).toBe("link"); expect(by[a]!.company_id).toBe(zq);
    expect(by[b]!.action).toBe("link"); expect(by[b]!.company_id).toBe(zq);
    expect(by[n]!.action).toBe("create"); expect(by[n]!.company_name).toBe("Zqnomatch Fragrance House");
    const r = await applyVendorLinks(db as never, TEST_OWNER_USER_ID, { decisions: [
      { vendor_id: a, company_id: zq }, { vendor_id: b, company_id: zq }, { vendor_id: n, create_name: "Zqnomatch Fragrance House" }] });
    expect(r).toEqual({ linked: 3, created: 1 });
    const rows = (await db.query<{ id: string; company_id: string }>(`SELECT id, company_id FROM perfume.vendors WHERE id = ANY($1::uuid[])`, [[a, b, n]])).rows;
    const co = Object.fromEntries(rows.map((x) => [x.id, x.company_id]));
    expect(co[a]).toBe(zq); expect(co[b]).toBe(zq); expect(co[n]).not.toBeNull();
    expect((await db.query(`SELECT role FROM perfume.contact_companies WHERE id = $1`, [zq])).rows[0].role).toBe("both");
    const made = (await db.query(`SELECT name, role, status FROM perfume.contact_companies WHERE id = $1`, [co[n]])).rows[0];
    expect(made).toEqual({ name: "Zqnomatch Fragrance House", role: "vendor", status: "active" });
    const ev = (await db.query<{ action: string; n: number }>(
      `SELECT action, count(*)::int AS n FROM perfume.lead_events WHERE company_id = ANY($1::uuid[]) GROUP BY action ORDER BY action`, [[zq, co[n]]])).rows;
    expect(ev).toEqual([{ action: "created_from_price_list", n: 1 }, { action: "price_list_vendor_linked", n: 3 }]);
    expect((await vendorLinkPreview(db as never)).unlinked).toBe(0);
  });

  it("a bad decision saves nothing", async () => {
    const v = await vendor("Zqbad Perfumes", "buy");
    await expect(applyVendorLinks(db as never, TEST_OWNER_USER_ID, { decisions: [
      { vendor_id: v, create_name: "Zqbad Perfumes" }, { vendor_id: v, company_id: "00000000-0000-4000-8000-000000000000" }] })).rejects.toThrow(/not in Contacts/);
    expect((await db.query(`SELECT company_id FROM perfume.vendors WHERE id = $1`, [v])).rows[0].company_id).toBeNull();
    expect((await db.query(`SELECT count(*)::int AS n FROM perfume.contact_companies WHERE name = 'Zqbad Perfumes'`)).rows[0].n).toBe(0);
  });

  it("Convert to vendor / customer / both with a catalog type; one history row; a type not in Catalogs or a vendor turned customer-only is refused", async () => {
    const co = await company("Zqrole Flippers", null);
    await db.query(`INSERT INTO perfume.catalog_values (kind, value) VALUES ('customer_type', 'Zq Trader') ON CONFLICT DO NOTHING`);
    const r = await setCompanyRole(db as never, TEST_OWNER_USER_ID, co, { role: "customer", customer_type: "Zq Trader" });
    expect(r).toMatchObject({ changed: true, role: "customer", customer_type: "Zq Trader" });
    expect((await db.query(`SELECT role, customer_type FROM perfume.contact_companies WHERE id = $1`, [co])).rows[0]).toEqual({ role: "customer", customer_type: "Zq Trader" });
    const ev = (await db.query(`SELECT detail FROM perfume.lead_events WHERE company_id = $1 AND action = 'role_type_set'`, [co])).rows;
    expect(ev).toHaveLength(1);
    expect(ev[0].detail.before.role).toBeNull();
    await expect(setCompanyRole(db as never, TEST_OWNER_USER_ID, co, { customer_type: "Not A Type" })).rejects.toThrow(/not a customer type/);
    expect((await setCompanyRole(db as never, TEST_OWNER_USER_ID, co, { role: "customer" })).changed).toBe(false);
    const v = await vendor("Zqrole Flippers", "buy");
    await applyVendorLinks(db as never, TEST_OWNER_USER_ID, { decisions: [{ vendor_id: v, company_id: co }] });
    expect((await db.query(`SELECT role FROM perfume.contact_companies WHERE id = $1`, [co])).rows[0].role).toBe("both");
    await expect(setCompanyRole(db as never, TEST_OWNER_USER_ID, co, { role: "customer" })).rejects.toThrow(/stays a vendor/);
  });
});
