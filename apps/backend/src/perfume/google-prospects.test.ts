/**
 * PERFUME-CONTACTS — Google business search (owner 2026-11-25 22:09 CT: "Yes ask for it and I want is possible all the data").
 *
 * GUARD (research session ROUND P1.2 / Lead ROUND P1.3): the perfume field mask carries phone + website (+ every business
 * field), and the TRUCKING mask is byte-for-byte what it was on main 58422c5b at BOTH of its call sites — address
 * autocomplete / place details (PLACES_FIELD_MASK, google-places-client.ts:148) and facilityAtPoint searchNearby (:395).
 * Plus: the city × keyword plan, Google → row mapping, phone / name dedupe keys, pagination and the request count.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import {
  buildPlan, cityLabel, PERFUME_PROSPECT_FIELD_MASK, phone10, planCounts, PROSPECT_CITIES, PROSPECT_KEYWORDS, searchText, toProspectRow,
  type GooglePlace,
} from "./google-prospects.js";
import { batchPlan, FIRST_RUN_CITY, findExisting, planFor, saveProspect } from "./contacts.service.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const truckingClient = fs.readFileSync(path.join(here, "..", "integrations", "google", "google-places-client.ts"), "utf8");

describe("GUARD — perfume mask has every business field; the trucking mask is unchanged at both call sites", () => {
  it("PERFUME_PROSPECT_FIELD_MASK carries phone, website, hours, rating and the rest", () => {
    const f = PERFUME_PROSPECT_FIELD_MASK.split(",");
    for (const need of ["places.nationalPhoneNumber", "places.internationalPhoneNumber", "places.websiteUri", "places.regularOpeningHours",
      "places.rating", "places.userRatingCount", "places.businessStatus", "places.googleMapsUri", "places.addressComponents", "places.id"]) {
      expect(f).toContain(need);
    }
  });
  it("trucking PLACES_FIELD_MASK is exactly the six address fields (no phone, no website)", () => {
    expect(truckingClient).toContain(
      'const PLACES_FIELD_MASK =\n  "places.id,places.displayName,places.formattedAddress,places.addressComponents,places.location,places.types";');
    expect(truckingClient.match(/const PLACES_FIELD_MASK/g)?.length).toBe(1);
  });
  it("trucking searchNearby (facilityAtPoint) still asks only PLACES_FIELD_MASK + primaryType", () => {
    expect(truckingClient).toContain('"X-Goog-FieldMask": `${PLACES_FIELD_MASK},places.primaryType`,');
    expect(truckingClient).not.toMatch(/nationalPhoneNumber|websiteUri|PERFUME_PROSPECT_FIELD_MASK/);
  });
  it("the perfume module never imports the trucking Google client", () => {
    for (const f of ["google-prospects.ts", "contacts.service.ts", "contacts.routes.ts"]) {
      expect(fs.readFileSync(path.join(here, f), "utf8")).not.toMatch(/from\s+["'][^"']*integrations\/google/);
    }
  });
});

describe("the city × keyword plan", () => {
  it("44 cities (27 US + 17 MX) × 5 keywords (no liquor / tobacco / beer), English and Spanish; 'beauty supply' once", () => {
    expect(PROSPECT_CITIES.filter((c) => c.country === "US")).toHaveLength(27);
    expect(PROSPECT_CITIES.filter((c) => c.country === "MX")).toHaveLength(17);
    expect(PROSPECT_KEYWORDS).toHaveLength(5);
    expect(PROSPECT_KEYWORDS.map((k) => k.category)).not.toEqual(expect.arrayContaining(["Liquor"]));
    expect(PROSPECT_KEYWORDS.some((k) => /liquor|licor|tobacco|tabaco|cigar|puros|beer|cerveza/i.test(`${k.en} ${k.es}`))).toBe(false);
    const plan = buildPlan();
    expect(planCounts(plan)).toEqual({ searches: 44 * 9, maxRequests: 44 * 9 * 3, cities: 44 });
    expect(plan.filter((p) => p.textQuery === "perfumería en Nuevo Laredo, Tamaulipas, México")).toHaveLength(1);
    expect(plan.filter((p) => p.textQuery === "perfume store in Laredo, TX")).toHaveLength(1);
  });
  it("the first run is Nuevo Laredo only — 9 searches, at most 27 requests", () => {
    expect(FIRST_RUN_CITY).toBe(cityLabel({ city: "Nuevo Laredo", state: "Tamaulipas", country: "MX" }));
    expect(planCounts(planFor(FIRST_RUN_CITY))).toEqual({ searches: 9, maxRequests: 27, cities: 1 });
    expect(batchPlan().first_city.searches).toBe(9);
    expect(planFor("Nowhere, XX")).toHaveLength(0);
  });
});

const place = (p: Partial<GooglePlace> = {}): GooglePlace => ({
  id: "ChIJ-test-1", displayName: { text: "Perfumería La Rosa" }, formattedAddress: "Av. Guerrero 100, Centro, 88000 Nuevo Laredo, Tamps., México",
  addressComponents: [
    { longText: "Nuevo Laredo", shortText: "Nuevo Laredo", types: ["locality", "political"] },
    { longText: "Tamaulipas", shortText: "Tamps.", types: ["administrative_area_level_1", "political"] },
    { longText: "México", shortText: "MX", types: ["country", "political"] },
    { longText: "88000", shortText: "88000", types: ["postal_code"] },
  ],
  types: ["store", "point_of_interest"], primaryType: "store", businessStatus: "OPERATIONAL", googleMapsUri: "https://maps.google.com/?cid=1",
  nationalPhoneNumber: "867 712 3456", internationalPhoneNumber: "+52 867 712 3456", websiteUri: "https://larosa.mx/",
  regularOpeningHours: { weekdayDescriptions: ["lunes: 9:00–20:00"] }, rating: 4.4, userRatingCount: 87, ...p,
});

describe("Google place → contact row, and the dedupe keys", () => {
  it("maps every field; missing name or id is dropped", () => {
    expect(toProspectRow(place())).toEqual({
      place_id: "ChIJ-test-1", name: "Perfumería La Rosa", address: "Av. Guerrero 100, Centro, 88000 Nuevo Laredo, Tamps., México",
      city: "Nuevo Laredo", state: "Tamps.", zip: "88000", country: "MX", phone: "867 712 3456", phone_intl: "+52 867 712 3456",
      website: "https://larosa.mx/", maps_uri: "https://maps.google.com/?cid=1", business_status: "OPERATIONAL", primary_type: "store",
      types: ["store", "point_of_interest"], rating: 4.4, rating_count: 87, hours: ["lunes: 9:00–20:00"],
    });
    expect(toProspectRow(place({ id: undefined }))).toBeNull();
    expect(toProspectRow(place({ displayName: { text: " " } }))).toBeNull();
  });
  it("phone last 10 digits match across +52 / (956) formats; short numbers give no key", () => {
    expect(phone10("+52 867 712 3456")).toBe("8677123456");
    expect(phone10("(867) 712-3456")).toBe("8677123456");
    expect(phone10("712-3456")).toBeNull();
  });
});

describe("searchText — follows pages, counts every billed request, sends the perfume mask", () => {
  it("3 pages → 3 requests, 60 rows max, X-Goog-FieldMask = perfume mask + nextPageToken", async () => {
    const prev = process.env.GOOGLE_PLACES_API_KEY;
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    const seen: Array<{ mask: string; body: Record<string, unknown> }> = [];
    let n = 0;
    const fake = (async (_url: string, init: RequestInit) => {
      const h = init.headers as Record<string, string>;
      seen.push({ mask: h["X-Goog-FieldMask"]!, body: JSON.parse(String(init.body)) });
      n += 1;
      const places = Array.from({ length: 20 }, (_, i) => place({ id: `p${n}-${i}` }));
      return new Response(JSON.stringify({ places, ...(n < 3 ? { nextPageToken: `t${n}` } : {}) }), { status: 200 });
    }) as unknown as typeof fetch;
    try {
      const r = await searchText("perfumería en Nuevo Laredo", { fetchImpl: fake, regionCode: "mx", languageCode: "es" });
      expect([r.requests, r.rows.length]).toEqual([3, 60]);
      expect(seen[0]!.mask).toBe(`${PERFUME_PROSPECT_FIELD_MASK},nextPageToken`);
      expect(seen[1]!.body["pageToken"]).toBe("t1");
      expect(seen[0]!.body).toMatchObject({ textQuery: "perfumería en Nuevo Laredo", pageSize: 20, regionCode: "mx", languageCode: "es" });
    } finally {
      if (prev === undefined) delete process.env.GOOGLE_PLACES_API_KEY; else process.env.GOOGLE_PLACES_API_KEY = prev;
    }
  });
  it("Google's own error text comes back (never the key)", async () => {
    const prev = process.env.GOOGLE_PLACES_API_KEY;
    process.env.GOOGLE_PLACES_API_KEY = "secret-key";
    const fake = (async () => new Response(JSON.stringify({ error: { message: "Places API (New) has not been used in project 1" } }), { status: 403 })) as unknown as typeof fetch;
    try {
      await expect(searchText("x", { fetchImpl: fake })).rejects.toThrow(/google_places_http_403: Places API \(New\) has not been used/);
      await expect(searchText("x", { fetchImpl: fake })).rejects.not.toThrow(/secret-key/);
    } finally {
      if (prev === undefined) delete process.env.GOOGLE_PLACES_API_KEY; else process.env.GOOGLE_PLACES_API_KEY = prev;
    }
  });
});

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("Google result saved to the contacts database (real Postgres, rolled back)", () => {
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

  it("inserts once with its origin; the same place, the same phone, or the same name + city is matched, never doubled", async () => {
    const kw = PROSPECT_KEYWORDS[0]!;
    const r = toProspectRow(place())!;
    expect(await saveProspect(db as never, r, kw, "perfumería en Nuevo Laredo", TEST_OWNER_USER_ID)).toBe("inserted");
    const co = (await db.query(`SELECT id, role, source, phone, website, google_rating::text AS rating, categories, customer_type FROM perfume.contact_companies WHERE google_place_id = $1`, [r.place_id])).rows[0];
    expect([co.role, co.source, co.phone, co.website, co.rating, co.categories, co.customer_type])
      .toEqual(["customer", "Google", "867 712 3456", "https://larosa.mx/", "4.4", ["Perfume"], "Retailer"]);
    expect((await db.query(`SELECT how, source FROM perfume.contact_origins WHERE company_id = $1`, [co.id])).rows).toEqual([{ how: "Google business search", source: "Google Places" }]);

    // Same place again → matched (no second row, no second origin).
    expect(await saveProspect(db as never, r, kw, "perfume store in Nuevo Laredo", TEST_OWNER_USER_ID)).toBe("matched");
    // Another place id, same phone written differently → matched.
    expect(await findExisting(db as never, { ...r, place_id: "ChIJ-other", phone: "(867) 712-3456", phone_intl: null })).toBe(co.id);
    // Another place id, no phone, same name + city → matched.
    expect(await findExisting(db as never, { ...r, place_id: "ChIJ-other-2", phone: null, phone_intl: null, name: "PERFUMERIA LA ROSA S.A. de C.V." })).toBe(co.id);
    expect((await db.query(`SELECT count(*)::int AS n FROM perfume.contact_companies WHERE name ILIKE 'Perfumer%a La Rosa%'`)).rows[0].n).toBe(1);
    // The one name key (SQL) — accents, punctuation and the company-form tail do not matter.
    const keys = (await db.query(`SELECT perfume.name_key('Perfumería La Rosa, S.A. de C.V.') AS a, perfume.name_key('PERFUMERIA LA ROSA') AS b,
      perfume.name_key('Broadway Fragrance LLC') AS c, perfume.name_key('Coswell Inc.') AS d`)).rows[0];
    expect([keys.a, keys.c, keys.d]).toEqual([keys.b, "broadway fragrance", "coswell"]);
    expect((await db.query(`SELECT count(*)::int AS n FROM perfume.contact_origins WHERE company_id = $1`, [co.id])).rows[0].n).toBe(1);

    // A value the owner already has is never overwritten by Google.
    await db.query(`UPDATE perfume.contact_companies SET website = 'https://mine.example/' WHERE id = $1`, [co.id]);
    expect(await saveProspect(db as never, { ...r, website: "https://google.example/" }, kw, "q", TEST_OWNER_USER_ID)).toBe("matched");
    expect((await db.query(`SELECT website FROM perfume.contact_companies WHERE id = $1`, [co.id])).rows[0].website).toBe("https://mine.example/");

    // Permanently closed → skipped, nothing written.
    expect(await saveProspect(db as never, toProspectRow(place({ id: "ChIJ-closed", displayName: { text: "Cerrada" }, nationalPhoneNumber: "867 000 1111", businessStatus: "CLOSED_PERMANENTLY" }))!, kw, "q", TEST_OWNER_USER_ID)).toBe("skipped_closed");
    expect((await db.query(`SELECT count(*)::int AS n FROM perfume.contact_companies WHERE google_place_id = 'ChIJ-closed'`)).rows[0].n).toBe(0);
  });
});
