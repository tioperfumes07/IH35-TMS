/**
 * PERFUME-DESK — my saved lists (owner 2026-11-19 05:46 CT): "add function to save, for instance the current lists and
 * comparisons, and then add another function so i can switch between this one and the new testers one etc. offer 1, 2 3
 * or import 1-2-3 or by date." and 05:37 CT: "if i import this i dont want the current comparison to be deleted."
 * A list of mine saved as a NEW list keeps every other one (never voided); one switch puts any saved list back in use and
 * the grid reads only the one in use. Real Postgres in CI, rolled back; the grouping is pure.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { buildGrid, groupSavedLists, importList, invalidateGridCache, mySavedLists, SavedListError, useSavedList, type SavedListLine } from "./desk.service.js";

describe("groupSavedLists (pure)", () => {
  const L = (id: string, label: string | null, at: string, cur: boolean, kind: "offer" | "inventory" = "offer", date = "2026-11-13"): SavedListLine =>
    ({ id, vendor_id: kind === "offer" ? "vo" : "vi", vendor_name: kind, kind, label, file_name: `${id}.xlsx`, list_date: date, rows_saved: 10, is_current: cur, imported_at: at });
  it("numbers saved lists per kind in import order; lines sharing a name are one saved list", () => {
    const g = groupSavedLists([
      L("b", "Testers", "2026-11-19T11:00:00Z", true, "offer", "2026-11-19"),
      L("a", null, "2026-11-13T10:00:00Z", false),
      L("c", "Testers", "2026-11-19T11:05:00Z", true, "offer", "2026-11-19"),
      L("d", null, "2026-11-19T12:00:00Z", true, "inventory", "2026-11-19"),
    ]);
    expect(g.map((x) => [x.kind, x.number, x.name, x.lines, x.in_use])).toEqual([
      ["offer", 1, "a.xlsx · 2026-11-13", 10, false],
      ["offer", 2, "Testers", 20, true],
      ["inventory", 1, "d.xlsx · 2026-11-19", 10, true],
    ]);
    expect(g[1].list_ids).toEqual(["b", "c"]);
  });
});

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
describeIntegration("saved lists: import as new keeps the old list; switching changes what the grid reads (real Postgres, rolled back)", () => {
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

  it("offer 1 stays saved when offer 2 is imported as new; either one can be put back in use", async () => {
    const mine = (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, kind) VALUES ('ZZSL MY OFFER', 'offer') RETURNING id`)).rows[0].id;
    const supplier = (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, kind) VALUES ('ZZSL SUPPLIER', 'buy') RETURNING id`)).rows[0].id;
    const a = { row_no: 1, upc: "8000000998010", brand: "ZZSL", description: "ZZSL ALPHA (M) EDT SP 3.4oz" };
    const b = { row_no: 1, upc: "8000000998027", brand: "ZZSL", description: "ZZSL BETA TESTER (W) EDP 3.4oz" };
    await importList(db as never, TEST_OWNER_USER_ID, { vendor_id: supplier, list_date: "2026-11-13", file_name: "s.xlsx", source_kind: "xlsx", rows_read: 2, file_price_total_cents: 3000, rows: [{ ...a, price: "10.00" }, { ...b, row_no: 2, price: "20.00" }] });
    const one = await importList(db as never, TEST_OWNER_USER_ID, { vendor_id: mine, list_date: "2026-11-13", file_name: "offer.csv", source_kind: "csv", rows_read: 1, file_price_total_cents: 1500, rows: [{ ...a, price: "15.00" }] });
    // Offer 2 saved as a NEW list: offer 1 is kept (not voided) and only taken out of use.
    const two = await importList(db as never, TEST_OWNER_USER_ID, { vendor_id: mine, list_date: "2026-11-19", file_name: "LISTA IVA testers.xlsx", label: "LISTA IVA testers", source_kind: "xlsx", rows_read: 1, file_price_total_cents: 2477, rows: [{ ...b, price: "24.77" }], save_as_new: true });
    const st = (await db.query<{ id: string; is_current: boolean; voided_at: string | null }>(`SELECT id, is_current, voided_at FROM perfume.price_lists WHERE vendor_id = $1 ORDER BY list_date`, [mine])).rows;
    expect(st.map((x) => [x.id, x.is_current, x.voided_at])).toEqual([[one.list_id, false, null], [two.list_id, true, null]]);

    let saved = (await mySavedLists(db as never)).filter((s) => s.vendor_id === mine);
    expect(saved.map((s) => [s.number, s.name, s.in_use])).toEqual([[1, "offer.csv · 2026-11-13", false], [2, "LISTA IVA testers", true]]);

    const ids = async () => {
      const r = await db.query<{ upc: string; item_id: string }>(`SELECT upc, item_id FROM perfume.item_upcs WHERE upc IN ('8000000998010','8000000998027')`);
      return Object.fromEntries(r.rows.map((x) => [x.upc, x.item_id]));
    };
    const it = await ids();
    invalidateGridCache();
    let g = await buildGrid(db as never);
    expect(g.rows.find((r) => r.id === it["8000000998027"])?.my_offer_price).toBe(2477);
    expect(g.rows.find((r) => r.id === it["8000000998010"])?.my_offer_price ?? null).toBeNull();

    // Switch back to offer 1: the grid reads it again; offer 2 stays saved.
    await useSavedList(db as never, mine, saved[0].key);
    invalidateGridCache();
    g = await buildGrid(db as never);
    expect(g.rows.find((r) => r.id === it["8000000998010"])?.my_offer_price).toBe(1500);
    expect(g.rows.find((r) => r.id === it["8000000998027"])?.my_offer_price ?? null).toBeNull();
    saved = (await mySavedLists(db as never)).filter((s) => s.vendor_id === mine);
    expect(saved.map((s) => s.in_use)).toEqual([true, false]);

    // None in use, then a supplier is refused (only my lists have saved lists); an unknown name is refused.
    await useSavedList(db as never, mine, null);
    expect((await mySavedLists(db as never)).filter((s) => s.vendor_id === mine).some((s) => s.in_use)).toBe(false);
    await expect(useSavedList(db as never, supplier, null)).rejects.toBeInstanceOf(SavedListError);
    await expect(useSavedList(db as never, mine, "no such list")).rejects.toBeInstanceOf(SavedListError);
    expect((await db.query(`SELECT 1 FROM perfume.price_lists WHERE vendor_id = $1 AND voided_at IS NOT NULL`, [mine])).rowCount).toBe(0);
  });
});
