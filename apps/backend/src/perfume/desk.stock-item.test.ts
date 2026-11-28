/**
 * LEAD ROUND L.22 (owner 2026-11-27 16:10 CT): "Stock item N" — and an inactive item — is hidden from the desk's lists and still
 * found by search. Real Postgres, rolled back.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { buildGrid, deskListRows, invalidateGridCache } from "./desk.service.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { createItem, updateItemFile } from "./items.service.js";
import { stockIn } from "./inventory.service.js";
import { inventoryStatus, reportFilter } from "./reports.service.js";
import { searchQuoteItems } from "./quotes.service.js";

describe("deskListRows", () => {
  it("hides listed 0 rows unless searched", () => {
    const rows = [{ id: "a", listed: 1, name: "ONE" }, { id: "b", listed: 0, name: "TWO" }];
    expect(deskListRows(rows, "").map((r) => r.id)).toEqual(["a"]);
    expect(deskListRows(rows, null).map((r) => r.id)).toEqual(["a"]);
  });
});

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
describeIntegration("Stock item N / inactive off the desk lists (real Postgres, rolled back)", () => {
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

  it("a Stock item N and an inactive item are listed 0 — off the lists, found by search; a regular item stays listed", async () => {
    const item = async (name: string, stock: boolean, active: boolean) => (await db.query<{ id: string }>(
      `INSERT INTO perfume.items (brand, name, size_ml, conc, gender, identity_key, loose_key, display_name, is_stock_item, is_active)
       VALUES ('ZZSTK', $1, 100, 'EDP', 'M', $2, 'x', $3, $4, $5) RETURNING id`, [name, `ZZSTK|${name}|100|EDP|M|`, `ZZSTK · ${name}`, stock, active])).rows[0].id;
    const reg = await item("KEEPS", true, true), non = await item("NONSTOCK", false, true), off = await item("RETIRED", true, false);
    invalidateGridCache();
    const g = await buildGrid(db as never);
    const by = Object.fromEntries(g.rows.filter((r) => [reg, non, off].includes(String(r.id))).map((r) => [String(r.id), r]));
    expect(by[reg]!.listed).toBe(1);
    expect(by[non]!.listed).toBe(0);
    expect(by[off]!.listed).toBe(0);
    const listed = deskListRows(g.rows, "").map((r) => String(r.id));
    expect(listed).toContain(reg);
    expect(listed).not.toContain(non);
    expect(listed).not.toContain(off);
    expect(deskListRows(g.rows, "ZZSTK NONSTOCK").map((r) => String(r.id))).toContain(non);
  });

  it("inventory status (active only) and the quote item picker leave a Stock item N out; the item stays found by the item search", async () => {
    await db.query(`INSERT INTO perfume.locations (code, name, sort_order, kind, own) VALUES ('ZSK', 'ZZ stock-item', 903, 'warehouse', true)`);
    const keep = (await createItem(db as never, TEST_OWNER_USER_ID, { brand: "ZZSKX", name: "KEEPER", size_ml: 100, tio_code: "ZSKX-001" })).id;
    const non = (await createItem(db as never, TEST_OWNER_USER_ID, { brand: "ZZSKX", name: "NONSTOCKER", size_ml: 100, tio_code: "ZSKX-002" })).id;
    for (const id of [keep, non]) await stockIn(db as never, TEST_OWNER_USER_ID, { kind: "opening", item_id: id, location_code: "ZSK", qty: 3, unit_cost_cents: 1000, source: "opening" });
    await updateItemFile(db as never, TEST_OWNER_USER_ID, non, { is_stock_item: false });
    const st = await inventoryStatus(db as never, reportFilter.parse({ code_from: "ZSKX-001", code_to: "ZSKX-002" }));
    expect(st.rows.map((r) => r.tio_code)).toEqual(["ZSKX-001"]);
    const picker = await searchQuoteItems(db as never, "ZZSKX");
    expect(picker.map((r) => r.id)).toEqual([keep]);
  });
});
