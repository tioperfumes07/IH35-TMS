/**
 * PERFUME-CAMPAIGNS + TRADERS (design boards 4 and 3). Pure rules, then real Postgres, rolled back:
 * who a campaign reaches (one row per email; phone-only, opted-out and invalid left out; Mexico → Spanish), the content
 * each language gets, attachments kept for a scheduled send, and the traders board (stages, buyers, exposed lists,
 * the brands each vendor's current list carries).
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { importRecords, importRecordSchema } from "./contacts.import.js";
import { addAttachment, audienceOf, campaignSchema, contentFor, getCampaign, languageOf, saveCampaign, saveSegment, listSegments } from "./campaigns.service.js";
import { addBuyer, saveTrade, setStage, tradersOverview, tradeSchema, updateBuyer } from "./traders.service.js";
import { importList, upsertVendor } from "./desk.service.js";

describe("campaign rules", () => {
  it("Mexico, Latin America and Spain read Spanish; everyone else English", () => {
    expect(["MX", "Mexico", "México", "Colombia", "Panama", "ES"].map(languageOf)).toEqual(["es", "es", "es", "es", "es", "es"]);
    expect(["US", "United States", "UAE", null, ""].map(languageOf)).toEqual(["en", "en", "en", "en", "en"]);
  });
  it("each language gets its own subject and message; the other stands in when only one is written", () => {
    const both = { subject_en: "Weekly offer", subject_es: "Oferta semanal", body_en: "Hi", body_es: "Hola" };
    expect(contentFor(both, "es")).toEqual({ subject: "Oferta semanal", body: "Hola" });
    expect(contentFor({ ...both, subject_es: null, body_es: null }, "es")).toEqual({ subject: "Weekly offer", body: "Hi" });
    expect(contentFor({ subject_en: "", subject_es: null, body_en: "Hi", body_es: null }, "en")).toBeNull();
  });
  it("a campaign needs a name; a trade needs an item and a real stage", () => {
    expect(campaignSchema.safeParse({ name: "", filters: {} }).success).toBe(false);
    expect(campaignSchema.parse({ name: "Weekly offer", filters: { countries: ["MX"] } }).language).toBe("auto");
    expect(tradeSchema.safeParse({ item: "Armani Code 4.2", stage: "won" }).success).toBe(false);
    expect(tradeSchema.parse({ item: "Armani Code 4.2", upc: "" }).upc).toBeNull();
  });
});

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
describeIntegration("campaigns and traders (real Postgres, rolled back)", () => {
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

  const rec = (r: Record<string, unknown>) => importRecordSchema.parse({ people: [], origins: [], ...r });

  it("reaches one address per person, leaves out phone-only / opted-out / invalid, and splits English and Spanish", async () => {
    await importRecords(db as never, [
      rec({ company: { name: "CMPTEST Perfumeria Rosa", country: "MX", city: "CMPTEST City", role: "customer", source: "CMPTEST" },
        people: [{ name: "Ana", email: "ana@cmptest-rosa.mx" }, { name: "Luis", phones: ["867 712 0001"] }] }),
      rec({ company: { name: "CMPTEST Fragrance NY", country: "US", city: "CMPTEST City", role: "customer", source: "CMPTEST" },
        people: [{ name: "Bob", email: "bob@cmptest-ny.com" }, { name: "Opted", email: "opted@cmptest-ny.com", opted_out: true }, { name: "Bad", email: "bad@nodot" }] }),
      rec({ company: { name: "CMPTEST Vendor", country: "US", city: "CMPTEST City", role: "vendor", source: "CMPTEST" },
        people: [{ name: "Vee", email: "vee@cmptest-vendor.com" }] }),
    ], TEST_OWNER_USER_ID);
    await db.query(`INSERT INTO perfume.mail_optouts (email, reason) VALUES ('vee@cmptest-vendor.com', 'replied STOP') ON CONFLICT DO NOTHING`);

    const customers = await audienceOf(db as never, { sources: ["CMPTEST"], roles: ["customer"] });
    expect([customers.companies, customers.with_email, customers.phone_only, customers.opted_out, customers.invalid]).toEqual([2, 4, 1, 1, 1]);
    expect(customers.recipients).toEqual([{ email: "bob@cmptest-ny.com", language: "en" }, { email: "ana@cmptest-rosa.mx", language: "es" }]);
    expect([customers.en, customers.es]).toEqual([1, 1]);

    const everyone = await audienceOf(db as never, { sources: ["CMPTEST"] }, "en");
    expect(everyone.recipients.map((r) => r.language)).toEqual(["en", "en"]); // the vendor's address is on the opt-out list
    expect(everyone.opted_out).toBe(2);
  });

  it("saves a segment and a campaign; an attachment is kept for a scheduled send", async () => {
    const seg = await saveSegment(db as never, TEST_OWNER_USER_ID, { name: "CMPTEST customers", filters: { sources: ["CMPTEST"], roles: ["customer"] } });
    expect((await listSegments(db as never)).some((s) => s.id === seg.id)).toBe(true);
    const cmp = await saveCampaign(db as never, TEST_OWNER_USER_ID, campaignSchema.parse({
      name: "CMPTEST weekly", segment_id: seg.id, filters: { sources: ["CMPTEST"], roles: ["customer"] },
      subject_en: "TIO weekly offer", subject_es: "Oferta semanal TIO", body_en: "Attached.", body_es: "Adjunta.",
    }));
    const a = await addAttachment(db as never, TEST_OWNER_USER_ID, cmp.id, { name: "TIO-offer.xlsx", content_base64: Buffer.from("PK test").toString("base64") });
    expect(a.bytes).toBe(7);
    const got = await getCampaign(db as never, cmp.id);
    expect([got.campaign.status, got.campaign.language, got.campaign.attachment_names]).toEqual(["draft", "auto", ["TIO-offer.xlsx"]]);
    expect(got.attachments).toHaveLength(1);
  });

  it("moves a trade across the board, adds buyers, and reads exposed lists and brands from what the app holds", async () => {
    await importRecords(db as never, [
      rec({ company: { name: "CMPTEST Buyer One", city: "CMPTEST City", role: "customer", source: "CMPTEST" },
        origins: [{ how: "Copied on vendor email", source: "Copied by Cmptestvendora" }, { how: "Copied on vendor email", source: "Copied by Cmptestvendorb" }] }),
      rec({ company: { name: "CMPTEST Buyer Two", city: "CMPTEST City", role: "customer", source: "CMPTEST" },
        origins: [{ how: "Copied on vendor email", source: "Copied by Cmptestvendora" }] }),
    ], TEST_OWNER_USER_ID);
    const buyerOne = (await db.query<{ id: string }>(`SELECT id FROM perfume.contact_companies WHERE name = 'CMPTEST Buyer One'`)).rows[0]!.id;

    const t = await saveTrade(db as never, TEST_OWNER_USER_ID, tradeSchema.parse({ item: "CMPTEST Armani Code 4.2 oz", brand: "Armani", buy_cents: 2850, sell_cents: 3200, qty: 120 }));
    const b = await addBuyer(db as never, TEST_OWNER_USER_ID, t.id, { company_id: buyerOne, offer_cents: 3200 });
    await updateBuyer(db as never, b.id, { status: "offered" });
    await setStage(db as never, t.id, "closed");

    const v = await upsertVendor(db as never, TEST_OWNER_USER_ID, { name: "CMPTEST TRADER", kind: "buy", short_name: "CMPT" });
    await importList(db as never, TEST_OWNER_USER_ID, { vendor_id: v.id, list_date: "2026-11-26", file_name: "cmptest.csv", source_kind: "csv",
      rows_read: 2, file_price_total_cents: 5000, rows: [
        { row_no: 1, upc: "8100000990011", brand: "CMPTESTBRAND", description: "CMPTESTBRAND ROSE EDP 100ML", price: "20.00" },
        { row_no: 2, upc: "8100000990012", brand: "CMPTESTBRAND", description: "CMPTESTBRAND OUD EDP 100ML", price: "30.00" }] } as never);

    const o = await tradersOverview(db as never, { brands: ["cmptestbrand"] });
    const trade = o.trades.find((x: { id: string }) => x.id === t.id);
    expect([trade.stage, trade.buyers.length, trade.buyers[0].status, trade.buyers[0].company]).toEqual(["closed", 1, "offered", "CMPTEST Buyer One"]);
    expect(trade.closed_on).not.toBeNull();
    expect(o.common_buyers.some((x: { name: string; lists: number }) => x.name === "CMPTEST Buyer One" && x.lists === 2)).toBe(true);
    expect(o.common_buyers.some((x: { name: string }) => x.name === "CMPTEST Buyer Two")).toBe(false);
    expect(o.exposed_lists.find((x: { sender: string }) => x.sender === "Cmptestvendora")?.buyers).toBe(2);
    expect(o.matrix_brands).toEqual(["CMPTESTBRAND"]);
    expect(o.matrix.find((r) => r.vendor === "CMPT")?.brands).toEqual({ CMPTESTBRAND: 2 });
  });
});
