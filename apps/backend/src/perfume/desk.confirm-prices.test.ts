/**
 * L.30 item 11 (owner 2026-11-27 15:42 CT "Later: confirm new prices into lists"): the ticked items' "My price @ my
 * margin" becomes my list price on my current offer list; an item off my list or without a calculated price is
 * reported, never guessed; the old price stays in price_edits. Real Postgres, rolled back.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { buildGrid, confirmPricesIntoList, importList, invalidateGridCache, rolesOfKind } from "./desk.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
describeIntegration("confirm prices into my list (real Postgres, rolled back)", () => {
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

  it("writes the calculated price on my list, reports the rest, keeps the old price", async () => {
    const mk = async (name: string, kind: string) => (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, kind, roles) VALUES ($1, $2, $3::text[]) RETURNING id`, [name, kind, rolesOfKind(kind as never)])).rows[0].id;
    const sup = await mk("ZZCP SUPPLIER", "buy");
    const mine = await mk("ZZCP MY OFFER", "offer");
    const a = { row_no: 1, upc: "8000000999031", brand: "ZZCP", description: "ZZCP ALPHA (W) EDP SP 3.4oz" };
    const b = { row_no: 2, upc: "8000000999048", brand: "ZZCP", description: "ZZCP BETA (W) EDP SP 3.4oz" };
    const z = { row_no: 3, upc: "8000000999055", brand: "ZZCP", description: "ZZCP ZETA (W) EDP SP 3.4oz" };
    await importList(db as never, TEST_OWNER_USER_ID, { vendor_id: sup, list_date: "2026-11-27", file_name: "s.xlsx", source_kind: "xlsx", rows_read: 2, file_price_total_cents: 2000, rows: [{ ...a, price: "10.00" }, { ...b, price: "10.00" }] });
    await importList(db as never, TEST_OWNER_USER_ID, { vendor_id: mine, list_date: "2026-11-27", file_name: "m.csv", source_kind: "csv", rows_read: 2, file_price_total_cents: 4000, rows: [{ ...a, price: "20.00" }, { ...z, price: "20.00" }] });
    const id = async (upc: string) => (await db.query<{ item_id: string }>(`SELECT item_id FROM perfume.item_upcs WHERE upc = $1`, [upc])).rows[0].item_id;
    const [ia, ib, iz] = [await id(a.upc), await id(b.upc), await id(z.upc)];

    invalidateGridCache();
    const before = (await buildGrid(db as never)).rows.find((r) => r.id === ia)!;
    const target = before.target_price_margin as number;
    expect(target).toBeGreaterThan(1000);
    expect(target % 25).toBe(0);

    const res = await confirmPricesIntoList(db as never, TEST_OWNER_USER_ID, { item_ids: [ia, ib, iz, ia] });
    expect(res.updated).toBe(1);
    expect(res.changes).toEqual([{ item_id: ia, from: 2000, to: target }]);
    expect(res.not_on_my_list).toEqual([ib]); // priced by a supplier, not on my list
    expect(res.no_price).toEqual([iz]);       // on my list, no supplier cost → no calculated price

    invalidateGridCache();
    const after = (await buildGrid(db as never)).rows.find((r) => r.id === ia)!;
    expect(after.my_offer_price).toBe(target);
    const edits = (await db.query<{ e: Array<{ from: number; to: number }> }>(
      `SELECT r.raw->'price_edits' AS e FROM perfume.price_list_rows r JOIN perfume.price_lists l ON l.id = r.list_id WHERE l.vendor_id = $1 AND r.item_id = $2`, [mine, ia])).rows[0].e;
    expect(edits.at(-1)).toMatchObject({ from: 2000, to: target });

    const again = await confirmPricesIntoList(db as never, TEST_OWNER_USER_ID, { item_ids: [ia] });
    expect([again.updated, again.unchanged]).toEqual([0, 1]);
  });
});
