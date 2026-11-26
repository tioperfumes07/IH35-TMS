/**
 * PERFUME-REVIEW-NEW-ITEMS (owner 2026-11-26 16:59 CT "get this all completely done"; 15:56 CT "completely new items …
 * should be automatically created"). Measured 23:00Z: of 958 waiting lines, MOD's minis / roll-ons had no suggestion at
 * all and my inventory's gifts only far ones (25%). A line with its own code or barcode and nothing 50% alike becomes its
 * own item — at import and at Rematch. A competitor's line never does; a line 50%+ alike stays in Review.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { rematchReview } from "./desk.service.js";
import { addItem, displayNameOf, emptyIndex, matchLine } from "./matching.js";
import { identify, looseKey } from "./normalize.js";

describe("nothing alike + own code = new item (pure)", () => {
  it("MOD mini with its code and no suggestion → new item", () => {
    const m = matchLine(emptyIndex(), "mod", { description: "MINI DAZZLING SILVER 5ML L", sku: "MINIDAZSIL5ML" }, { allowNewItem: true });
    expect([m.method, m.status]).toEqual(["new_item", "matched"]);
  });
  it("a gift far from every item (25%) → new item; one 50%+ alike stays in Review", () => {
    const ix = emptyIndex();
    const add = (id: string, d: string, brand: string) => {
      const x = identify({ description: d, brand });
      addItem(ix, { id, brand: x.brand, name: x.nameText, sizeMl: x.sizeMl, conc: x.conc, gender: x.gender, flags: x.flags, identityKey: x.key, looseKey: looseKey(x), displayName: displayNameOf(x) });
    };
    add("tote", "PARIS HILTON WHITE TOTE BAG", "PARIS HILTON");
    add("pouch", "GUESS ICONIC SMALL POUCH GWP (U)", "GUESS");
    const far = matchLine(ix, "inv", { description: "PARIS HILTON ELECTRIFY TUMBLER (GWP)", brand: "PARIS HILTON", sku: "105832" }, { allowNewItem: true, ownList: true });
    expect(far.method).toBe("new_item");
    const near = matchLine(ix, "inv", { description: "GUESS ICONIC POUCH GWP (U)", brand: "GUESS", sku: "109427" }, { allowNewItem: true, ownList: true });
    expect([near.method, near.status]).toEqual([null, "review"]);
  });
  it("no code: created only with brand + name + bottle size; otherwise it waits", () => {
    expect(matchLine(emptyIndex(), "mod", { description: "MINI DAZZLING SILVER 5ML L" }, { allowNewItem: true }).method).toBeNull();
    expect(matchLine(emptyIndex(), "parvin", { description: "Gucci Rush Women 1 OZ EDT SP", brand: "Gucci" }, { allowNewItem: true }).method).toBe("new_item");
    expect(matchLine(emptyIndex(), "parvin", { description: "Gucci Rush Women EDT SP", brand: "Gucci" }, { allowNewItem: true }).method).toBeNull();
    // A competitor's list never creates.
    expect(matchLine(emptyIndex(), "comp", { description: "Gucci Rush Women 1 OZ EDT SP", brand: "Gucci" }, { allowNewItem: false }).method).toBeNull();
  });
  it("\"Eau De Perfume\" is EDP; \"WITH CAP\" is packing, not name", () => {
    expect(identify({ description: "Le Beau Paradise Garden 2.5 Oz Eau De Perfume Spray", brand: "Jean Paul Gaultier" }).conc).toBe("EDP");
    expect(identify({ description: "TESTER VERSACE DYLAN BLUE  100 ML EDT SP(M) WITH CAP (ITALY)", brand: "VERSACE" }).nameWords).toEqual(["DYLAN", "BLUE"]);
    expect(identify({ description: "ARMANI STRONGER WITH YOU 100ML EDT M", brand: "ARMANI" }).nameWords).toContain("WITH");
  });
});

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("Rematch creates the new items (real Postgres, rolled back)", () => {
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

  it("creates the item, saves the vendor's code on it, and a competitor's line stays waiting", async () => {
    const vendor = async (name: string, kind: string) => (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, kind) VALUES ($1, $2) RETURNING id`, [name, kind])).rows[0].id;
    const mod = await vendor("MOD NEW ITEM TEST", "buy");
    const comp = await vendor("COMP NEW ITEM TEST", "sell");
    const list = async (v: string) => (await db.query<{ id: string }>(
      `INSERT INTO perfume.price_lists (vendor_id, list_date, file_name, source_kind, rows_read, rows_saved, rows_skipped, price_total_file_cents, price_total_saved_cents, is_current)
       VALUES ($1, '2026-11-26', 'x.xlsx', 'xlsx', 1, 1, 0, 100, 100, true) RETURNING id`, [v])).rows[0].id;
    const line = async (l: string, sku: string) => (await db.query<{ id: string }>(
      `INSERT INTO perfume.price_list_rows (list_id, row_no, raw, sku, description, price_cents, identity_key, loose_key, match_status)
       VALUES ($1, 1, '{}', $2, 'MINI ZZTESTSCENT SILVER 5ML L', 100, 'x', 'x', 'unmatched') RETURNING id`, [l, sku])).rows[0].id;
    const modRow = await line(await list(mod), "MINIZZT");
    const compRow = await line(await list(comp), "CZZT");

    const out = await rematchReview(db as never, TEST_OWNER_USER_ID);
    expect(out.items_created).toBeGreaterThanOrEqual(1);
    const r = (await db.query(`SELECT r.item_id, r.match_method, r.match_status, i.created_by FROM perfume.price_list_rows r LEFT JOIN perfume.items i ON i.id = r.item_id WHERE r.id = $1`, [modRow])).rows[0];
    expect(r).toMatchObject({ match_method: "new_item", match_status: "matched", created_by: TEST_OWNER_USER_ID });
    const alias = await db.query(`SELECT 1 FROM perfume.item_aliases WHERE vendor_id = $1 AND sku = 'MINIZZT' AND item_id = $2`, [mod, r.item_id]);
    expect(alias.rowCount).toBe(1);
    // The competitor's identical line links to the new item by its name — it never makes one of its own.
    const c = (await db.query(`SELECT item_id, match_method FROM perfume.price_list_rows WHERE id = $1`, [compRow])).rows[0];
    expect(c.match_method).not.toBe("new_item");
  });
});
