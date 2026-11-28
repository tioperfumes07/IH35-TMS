/** Owner 2026-11-28 14:24–14:26 CT: a lead with no email or phone — find its contact info on Google and its own website. */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { countryCode, findContactInfo, pickEmail, sameCompany, siteHost } from "./contact-enrich.service.js";
import type { ProspectRow, SearchPage } from "./google-prospects.js";

const place = (p: Partial<ProspectRow> & { place_id: string; name: string }): ProspectRow => ({ address: null, city: null, state: null, zip: null,
  country: "US", phone: null, phone_intl: null, website: null, maps_uri: null, business_status: "OPERATIONAL", primary_type: null, types: [],
  rating: null, rating_count: null, hours: null, ...p });

describe("contact info lookup — pure", () => {
  it("reads only public http(s) hosts", () => {
    expect(siteHost("https://www.aabeauty.com/shop")).toBe("aabeauty.com");
    expect(siteHost("http://127.0.0.1/x")).toBeNull();
    expect(siteHost("ftp://aabeauty.com")).toBeNull();
    expect(siteHost("http://localhost:3000")).toBeNull();
  });
  it("prefers the company's own generic box, skips images and no-reply", () => {
    expect(pickEmail(`<a href="mailto:Jane@AABeauty.com">x</a> info@aabeauty.com logo@2x.png noreply@aabeauty.com x@gmail.com`, "aabeauty.com")).toBe("info@aabeauty.com");
    expect(pickEmail(`write jane@aabeauty.com`, "aabeauty.com")).toBe("jane@aabeauty.com");
    expect(pickEmail(`sales@shopify-mail.com other@gmail.com`, "aabeauty.com")).toBe("sales@shopify-mail.com");
    expect(pickEmail(`nothing here`, "aabeauty.com")).toBeNull();
  });
  it("same company: exact name with a research-file city, street address, or city; not another city's store", () => {
    const g = (x: Partial<ProspectRow>) => place({ place_id: "p", name: "x", ...x });
    expect(countryCode("United States")).toBe("US"); expect(countryCode("México")).toBe("MX");
    // Research files wrote "US" / "Newark port" for the city — the exact name decides.
    expect(sameCompany({ name_key: "fragrancenet com", city: "New York (Hauppauge) / Newark port", country: "United States" }, g({ city: "Hauppauge", address: "104 Parkway Dr S, Hauppauge, NY" }), "fragrancenet com")).toBe(true);
    expect(sameCompany({ name_key: "victory international usa", city: "US", country: "United States" }, g({ city: "Edison" }), "victory international usa")).toBe(true);
    // Our street address in Google's address.
    expect(sameCompany({ name_key: "am beauty distributors", city: "New York", country: "US", address: "1573 Broadway, Hewlett, NY" }, g({ city: "Hewlett", address: "1573 Broadway, Hewlett, NY 11557" }), "am beauty distributors")).toBe(true);
    // Same name, another real city, no address of ours there → not ours.
    expect(sameCompany({ name_key: "rosas perfumes", city: "Albany", country: "US" }, g({ city: "Buffalo", address: "1 Elm St, Buffalo, NY" }), "rosas perfumes")).toBe(false);
    // Partial name needs the place too.
    expect(sameCompany({ name_key: "angel brand", city: "Newark port", country: "US" }, g({ city: "Newark", address: "5 Main St, Newark, NJ" }), "angel brand co")).toBe(true);
    expect(sameCompany({ name_key: "angel brand", city: "Newark port", country: "US" }, g({ city: "Miami", address: "5 Main St, Miami, FL" }), "angel brand co")).toBe(false);
    // Another country.
    expect(sameCompany({ name_key: "perfumes plus", city: null, country: "MX" }, g({ country: "US" }), "perfumes plus")).toBe(false);
    expect(sameCompany({ name_key: "perfumes plus", city: null, country: "US" }, g({ country: "US" }), "perfumes plus wholesale outlet")).toBe(false);
  });
});

describe.skipIf(process.env.GITHUB_ACTIONS !== "true")("contact info lookup (real Postgres, rolled back)", () => {
  let db: pg.Client;
  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    db = new pg.Client(buildPgClientConfig(process.env.DATABASE_URL!));
    await db.connect(); await db.query("BEGIN"); await db.query("SET LOCAL app.bypass_rls = 'lucia'");
  });
  afterAll(async () => { await db?.query("ROLLBACK").catch(() => {}); await db?.end().catch(() => {}); });

  it("fills phone, website and the site's email on the same company only; a different store is not used", async () => {
    const mk = async (name: string, city: string) => (await db.query<{ id: string }>(
      `INSERT INTO perfume.contact_companies (name, source, role, city, state, country, address)
       VALUES ($1, 'ZZENRICH', 'customer', $2, 'NY', 'US', $3) RETURNING id::text`, [name, city, `1 Main St, ${city}, NY`])).rows[0]!.id;
    const aa = await mk("ZZEnrich A & A Beauty Supply, Inc.", "Johnson City");
    const other = await mk("ZZEnrich Rosa's Perfumes", "Albany");
    const pages: Record<string, SearchPage> = {
      aa: { requests: 1, raw: [], rows: [place({ place_id: "zz-p-other", name: "Walgreens", city: "Johnson City" }),
        place({ place_id: "zz-p-aa", name: "ZZEnrich A&A Beauty Supply", city: "Johnson City", phone: "(607) 555-0101", website: "https://www.zzaabeauty.com/" })] },
      other: { requests: 1, raw: [], rows: [place({ place_id: "zz-p-rosa", name: "ZZEnrich Rosa's Perfumes", city: "Buffalo", phone: "(716) 555-0199" })] },
    };
    const search = async (q: string) => (q.includes("Rosa") ? pages.other! : pages.aa!);
    const fetchImpl = (async (url: string) => new Response(url.endsWith("/contact") ? `<p>write us: info@zzaabeauty.com</p>` : "<p>welcome</p>",
      { status: 200, headers: { "content-type": "text/html" } })) as unknown as typeof fetch;
    const r = await findContactInfo((fn) => fn(db), TEST_OWNER_USER_ID, { ids: [aa, other], limit: 10 }, { search: search as never, fetchImpl });
    expect(r).toMatchObject({ looked_up: 2, phone: 1, website: 1, email: 1, no_match: 1, error: 0 });

    const a = (await db.query(`SELECT phone, website, google_place_id FROM perfume.contact_companies WHERE id = $1`, [aa])).rows[0];
    expect(a).toEqual({ phone: "(607) 555-0101", website: "https://www.zzaabeauty.com/", google_place_id: "zz-p-aa" });
    expect((await db.query(`SELECT email, found_in FROM perfume.contact_people WHERE company_id = $1`, [aa])).rows).toEqual([{ email: "info@zzaabeauty.com", found_in: "website" }]);
    // Rosa's in Buffalo is not our Rosa's in Albany — nothing written but the lookup row.
    expect((await db.query(`SELECT phone FROM perfume.contact_companies WHERE id = $1`, [other])).rows[0]).toEqual({ phone: null });
    const origins = (await db.query<{ company_id: string; detail: string }>(
      `SELECT company_id::text, detail FROM perfume.contact_origins WHERE company_id = ANY($1::uuid[]) AND how = 'Contact info lookup' ORDER BY detail`, [[aa, other]])).rows;
    expect(origins).toHaveLength(2);
    expect(origins.find((o) => o.company_id === aa)!.detail).toContain("email info@zzaabeauty.com");
    expect(origins.find((o) => o.company_id === other)!.detail).toContain("none is this company");
    // No new company was created from the search.
    expect((await db.query(`SELECT 1 FROM perfume.contact_companies WHERE google_place_id IN ('zz-p-other', 'zz-p-rosa')`)).rowCount).toBe(0);
  });
});
