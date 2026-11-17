/**
 * PERFUME-DESK (owner 2026-11-17 14:04 CT): my list price, my last cost and my avg cost with margin / markup on every tab;
 * every price box of my lists editable, the engine recomputing the item; List analysis compared with LA ESPERANZA only.
 * Measured that hour: 27 supplier lists were saved as "both", so the analysis' "Esperanza Price" was the cheapest of 28
 * lists. The pure math runs everywhere (the same fixtures as the desk's perfumePriceMath.ts); the writes and the
 * competitor rule run on real Postgres in CI, rolled back.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { buildGrid, importList, invalidateGridCache, MyPriceError, myPriceMath, setMyPrice } from "./desk.service.js";

// Identical to apps/frontend/src/pages/perfume/perfumePriceMath.ts MY_PRICE_FIXTURES.
const FIXTURES: ReadonlyArray<{ in: [number | null, number | null, number | null, number | null]; out: Record<string, number | null> }> = [
  { in: [2000, 1500, 1600, 1400], out: { offer_profit: 500, offer_margin_pct: 25, offer_markup_pct: 33.3, offer_margin_avg_pct: 20, offer_markup_avg_pct: 25, buy_margin_pct: 30, buy_markup_pct: 42.9 } },
  { in: [2000, null, null, null], out: { offer_profit: null, offer_margin_pct: 0, offer_markup_pct: 0, offer_margin_avg_pct: 0, offer_markup_avg_pct: 0, buy_margin_pct: null, buy_markup_pct: null } },
  { in: [null, 1500, 1600, 1400], out: { offer_profit: null, offer_margin_pct: null, offer_markup_pct: null, offer_margin_avg_pct: null, offer_markup_avg_pct: null, buy_margin_pct: null, buy_markup_pct: null } },
  { in: [1000, 1250, null, 1100], out: { offer_profit: -250, offer_margin_pct: -25, offer_markup_pct: -20, offer_margin_avg_pct: 0, offer_markup_avg_pct: 0, buy_margin_pct: -10, buy_markup_pct: -9.1 } },
];

describe("myPriceMath — margin and markup on my list price", () => {
  it.each(FIXTURES)("%#", (f) => { expect(myPriceMath(...f.in)).toEqual(f.out); });
});

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
describeIntegration("my list price / my costs written on the desk; analysis = the competitor list only (real Postgres, rolled back)", () => {
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

  it("a 'both' supplier cheaper than Esperanza never becomes the analysis competitor; typed prices recompute the item", async () => {
    const mk = async (name: string, kind: string) => (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, kind) VALUES ($1, $2) RETURNING id`, [name, kind])).rows[0].id;
    const both = await mk("ZZMP SUPPLIER MARKED BOTH", "both");
    const esp = await mk("ZZMP ESPERANZA", "sell");
    const mine = await mk("ZZMP MY OFFER", "offer");
    const line = { row_no: 1, upc: "8000000999017", brand: "ZZMP", description: "ZZMP AURA (W) EDP SP 3.4oz" };
    await importList(db as never, TEST_OWNER_USER_ID, { vendor_id: both, list_date: "2026-11-17", file_name: "b.xlsx", source_kind: "xlsx", rows_read: 1, file_price_total_cents: 1000, rows: [{ ...line, price: "10.00" }] });
    await importList(db as never, TEST_OWNER_USER_ID, { vendor_id: esp, list_date: "2026-11-17", file_name: "e.pdf", source_kind: "pdf_text", rows_read: 1, file_price_total_cents: 2500, rows: [{ ...line, price: "25.00" }] });
    await importList(db as never, TEST_OWNER_USER_ID, { vendor_id: mine, list_date: "2026-11-17", file_name: "m.csv", source_kind: "csv", rows_read: 1, file_price_total_cents: 2000, rows: [{ ...line, price: "20.00" }] });
    const itemId = (await db.query<{ item_id: string }>(`SELECT item_id FROM perfume.item_upcs WHERE upc = '8000000999017'`)).rows[0].item_id;

    invalidateGridCache();
    let g = await buildGrid(db as never);
    let row = g.rows.find((r) => r.id === itemId)!;
    // Esperanza's sales price = 25.00 − the 0.50 cushion; never the supplier's 10.00.
    expect(row["a:esp"]).toBe(2450);
    expect(row["a:c_vendor"]).toContain("ZZMP ESPERANZA");
    expect(row.my_offer_price).toBe(2000);
    expect(row.offer_margin_pct).toBe(0); // no cost yet → 0 (owner 2026-11-15)

    await setMyPrice(db as never, TEST_OWNER_USER_ID, { item_id: itemId, field: "offer", cents: 1950 });
    await setMyPrice(db as never, TEST_OWNER_USER_ID, { item_id: itemId, field: "last_cost", cents: 1500 });
    await setMyPrice(db as never, TEST_OWNER_USER_ID, { item_id: itemId, field: "avg_cost", cents: 1600 });
    invalidateGridCache();
    g = await buildGrid(db as never);
    row = g.rows.find((r) => r.id === itemId)!;
    expect([row.my_offer_price, row.my_last_cost, row.my_avg_cost]).toEqual([1950, 1500, 1600]);
    expect(row.offer_margin_pct).toBe(23.1);
    expect(row.offer_markup_pct).toBe(30);
    expect(row.offer_margin_avg_pct).toBe(17.9);
    expect(row["a:margin"]).toBe(23.1);
    // The old price stays on the line.
    const edits = (await db.query<{ e: unknown }>(`SELECT r.raw->'price_edits' AS e FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id WHERE l.vendor_id = $1 AND r.item_id = $2 AND l.is_current`, [mine, itemId])).rows[0].e as Array<{ from: number; to: number }>;
    expect(edits.at(-1)).toMatchObject({ from: 2000, to: 1950 });
    // A list price for an item not on my list is refused.
    await expect(setMyPrice(db as never, TEST_OWNER_USER_ID, { item_id: "00000000-0000-0000-0000-000000000001", field: "offer", cents: 100 })).rejects.toBeInstanceOf(MyPriceError);
  });
});
