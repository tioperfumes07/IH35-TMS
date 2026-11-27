/**
 * PERFUME STOCK LINKAGE (owner 2026-11-27 06:19 CT): "I think you need to confirm all those perfumes correctly to upcs and vendors".
 * Linking one of OUR items onto the vendors' item moves its lines, UPCs, HK aliases, TIO code and avg cost and retires ours; a
 * different size or kind is refused; the strict rule pairs only one-to-one same-word, same-brand, same-bottle items. Real
 * Postgres, one transaction rolled back.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { getItemFile, ItemInvalid, linkItemTo, stockLinkQueue, strictLinkApply, strictLinkPreview } from "./items.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
describeIntegration("stock linkage (real Postgres, rolled back)", () => {
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
  const item = async (brand: string, name: string, size: number, gender: string | null, flags: string[] = []) => (await db.query<{ id: string }>(
    `INSERT INTO perfume.items (brand, name, size_ml, conc, gender, identity_key, loose_key, display_name, flags)
     VALUES ($1, $2, $3, 'EDP', $4, $5, 'x', $6, $7::text[]) RETURNING id`,
    [brand, name, size, gender ?? "", `${brand}|${name}|${size}|EDP|${gender ?? ""}|${flags.join("+")}`, `${brand} · ${name} · ${size} ml${flags.length ? " · " + flags.join(" · ") : ""}`, flags])).rows[0].id;
  const list = async (vendorId: string) => (await db.query<{ id: string }>(
    `INSERT INTO perfume.price_lists (vendor_id, list_date, file_name, source_kind, rows_read, rows_saved, rows_skipped, price_total_file_cents, price_total_saved_cents, is_current)
     VALUES ($1, current_date, 'zz.xlsx', 'xlsx', 1, 1, 0, 0, 0, true) RETURNING id`, [vendorId])).rows[0].id;
  const line = async (listId: string, n: number, itemId: string, sku: string | null, upc: string | null, desc: string, cents: number) => (await db.query<{ id: string }>(
    `INSERT INTO perfume.price_list_rows (list_id, row_no, raw, description, price_cents, identity_key, loose_key, item_id, match_method, match_status, sku, upc)
     VALUES ($1, $2, '{}'::jsonb, $3, $4, 'x', 'x', $5, 'key', 'matched', $6, $7) RETURNING id`, [listId, n, desc, cents, itemId, sku, upc])).rows[0].id;

  it("links our item onto the vendors' item with everything it carries; refuses another size or kind; strict pairs one-to-one only", async () => {
    const inv = (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, kind) VALUES ('ZZS Inventory', 'inventory') RETURNING id`)).rows[0].id;
    const sup = (await db.query<{ id: string }>(`INSERT INTO perfume.vendors (name, kind) VALUES ('ZZS Supplier', 'buy') RETURNING id`)).rows[0].id;
    const invL = await list(inv), supL = await list(sup);

    // OURS: "ZZS LE NOIR POUR HOMME" (HK spelling) — vendors': "ZZS NOIR" men. Same words once EDP / pour homme / le drop out.
    const mine = await item("ZZS", "LE NOIR POUR HOMME", 100, "M");
    const vend = await item("ZZS", "NOIR", 100, "M");
    const vend50 = await item("ZZS", "NOIR", 50, "M");
    const vendT = await item("ZZS", "NOIR", 100, "M", ["TESTER"]);
    const myLine = await line(invL, 1, mine, "Z700001", "0300000000017", "ZZS LE NOIR POUR HOMME EDP 100ML (M)", 4100);
    await line(supL, 1, vend, "S-1", null, "ZZS NOIR EDP 3.4 M", 3900);
    await line(supL, 2, vend50, "S-2", null, "ZZS NOIR EDP 1.7 M", 2900);
    await line(supL, 3, vendT, "S-3", null, "ZZS NOIR EDP 3.4 M TESTER", 3100);
    await db.query(`INSERT INTO perfume.item_upcs (upc, item_id) VALUES ('300000000017', $1)`, [mine]);
    await db.query(`UPDATE perfume.items SET internal_code = 'ZT-77' WHERE id = $1`, [mine]);
    await db.query(`INSERT INTO perfume.item_costs (item_id, avg_cost_cents, updated_by) VALUES ($1, 4000, $2)`, [mine, TEST_OWNER_USER_ID]);

    // A second pair that is NOT one-to-one: two of ours with the same words land on one vendors' item → never strict.
    const dupA = await item("ZZS", "BLEU", 100, null), dupB = await item("ZZS", "BLEU POUR HOMME", 100, null);
    const dupV = await item("ZZS", "BLEU", 100, "M");
    await line(invL, 2, dupA, "Z700002", null, "ZZS BLEU EDP 100ML", 5000);
    await line(invL, 3, dupB, "Z700003", null, "ZZS BLEU POUR HOMME EDP 100ML", 5000);
    await line(supL, 4, dupV, "S-4", null, "ZZS BLEU EDP 3.4 M", 4800);

    // The queue shows ours with the same bottle first; the 50 ml and the tester are never candidates.
    const q = await stockLinkQueue(db as never, { q: "zzs", perfumes_only: true, limit: 50, offset: 0 });
    const qm = q.rows.find((r) => r.id === mine)!;
    expect(qm.hk).toBe("Z700001");
    expect(qm.candidates[0]).toMatchObject({ id: vend, exact: true, same_brand: true });
    expect(qm.candidates.some((cd) => cd.id === vend50 || cd.id === vendT)).toBe(false);

    // Skincare / cosmetics / hair care are their own category (owner 07:50 CT): never in the perfume queue.
    const cream = await item("ZZS", "NOIR NIGHT CREAM", 50, null);
    await line(invL, 9, cream, "Z700009", null, "ZZS NOIR NIGHT CREAM 50ML", 2000);
    await db.query(`UPDATE perfume.items SET category = 'Skincare' WHERE id = $1`, [cream]);
    expect((await stockLinkQueue(db as never, { q: "zzs", perfumes_only: true, limit: 50, offset: 0 })).rows.some((r) => r.id === cream)).toBe(false);
    expect((await stockLinkQueue(db as never, { q: "zzs", perfumes_only: false, limit: 50, offset: 0 })).rows.some((r) => r.id === cream)).toBe(true);

    // Strict: only ours → vend; the BLEU pair is two-to-one and stays for him.
    const strict = (await strictLinkPreview(db as never)).filter((p) => p.mine.startsWith("ZZS"));
    expect(strict.map((p) => [p.mine_id, p.vend_id])).toEqual([[mine, vend]]);

    // Wrong size / wrong kind refused.
    await expect(linkItemTo(db as never, TEST_OWNER_USER_ID, mine, vend50)).rejects.toThrow(/Different sizes/);
    await expect(linkItemTo(db as never, TEST_OWNER_USER_ID, mine, vendT)).rejects.toThrow(/Different kind/);
    await expect(linkItemTo(db as never, TEST_OWNER_USER_ID, mine, mine)).rejects.toBeInstanceOf(ItemInvalid);

    expect(await strictLinkApply(db as never, TEST_OWNER_USER_ID)).toMatchObject({ linked: expect.any(Number) });
    const got = (await db.query(`SELECT item_id FROM perfume.price_list_rows WHERE id = $1`, [myLine])).rows[0].item_id;
    expect(got).toBe(vend);
    const v = (await db.query(`SELECT internal_code FROM perfume.items WHERE id = $1`, [vend])).rows[0];
    expect(v.internal_code).toBe("ZT-77");
    expect((await db.query(`SELECT item_id FROM perfume.item_upcs WHERE upc = '300000000017'`)).rows[0].item_id).toBe(vend);
    expect(Number((await db.query(`SELECT avg_cost_cents FROM perfume.item_costs WHERE item_id = $1`, [vend])).rows[0].avg_cost_cents)).toBe(4000);
    expect((await db.query(`SELECT merged_into_id FROM perfume.items WHERE id = $1`, [mine])).rows[0].merged_into_id).toBe(vend);
    // The next import of his inventory finds the vendors' item by the HK code.
    expect((await db.query(`SELECT count(*)::int AS n FROM perfume.item_aliases WHERE item_id = $1 AND vendor_id = $2`, [vend, inv])).rows[0].n).toBeGreaterThan(0);
    const f = await getItemFile(db as never, vend) as { events: Array<{ kind: string }> };
    expect(f.events.map((e) => e.kind)).toContain("line_linked");

    // Same bottle written two ways (4 oz = 118 vs 120 ml): refused unless the owner says so on the link, and only within 2.5 %.
    const green118 = await item("ZZS", "GREEN", 118, "M"), green120 = await item("ZZS", "GREEN", 120, "M"), green100 = await item("ZZS", "GREEN", 100, "M");
    await expect(linkItemTo(db as never, TEST_OWNER_USER_ID, green118, green120)).rejects.toThrow(/same bottle sizes/);
    await expect(linkItemTo(db as never, TEST_OWNER_USER_ID, green118, green100, { sameBottleSizes: true })).rejects.toThrow(/^Different sizes: 118 ml vs 100 ml\.$/);
    expect(await linkItemTo(db as never, TEST_OWNER_USER_ID, green118, green120, { sameBottleSizes: true })).toMatchObject({ into: expect.stringContaining("GREEN") });
    expect((await db.query(`SELECT merged_into_id FROM perfume.items WHERE id = $1`, [green118])).rows[0].merged_into_id).toBe(green120);
    expect((await db.query(`SELECT detail->'same_bottle_sizes' AS s FROM perfume.item_events WHERE item_id = $1 AND kind = 'line_linked'`, [green120])).rows[0].s).toEqual({ from_ml: 118, to_ml: 120 });

    // Two gift sets: what is inside (BODY / MINI / VARIOUS) is the owner's check, not a refusal; a set never links to a tester set or a single bottle.
    const setMine = await item("ZZS", "AQUA SET", 100, "M", ["SET"]), setVend = await item("ZZS", "AQUA SET SG", 100, "M", ["BODY", "SET"]);
    const setTester = await item("ZZS", "AQUA SET T", 100, "M", ["SET", "TESTER"]), single = await item("ZZS", "AQUA", 100, "M", ["BODY"]);
    await expect(linkItemTo(db as never, TEST_OWNER_USER_ID, setMine, setTester)).rejects.toThrow(/Different kind/);
    await expect(linkItemTo(db as never, TEST_OWNER_USER_ID, setMine, single)).rejects.toThrow(/Different kind/);
    expect(await linkItemTo(db as never, TEST_OWNER_USER_ID, setMine, setVend)).toMatchObject({ into: expect.stringContaining("AQUA SET SG") });
    // BLEU untouched until he links it by hand.
    expect((await db.query(`SELECT merged_into_id FROM perfume.items WHERE id = ANY($1::uuid[])`, [[dupA, dupB]])).rows.every((r) => r.merged_into_id === null)).toBe(true);
    await linkItemTo(db as never, TEST_OWNER_USER_ID, dupA, dupV);
    expect((await db.query(`SELECT merged_into_id FROM perfume.items WHERE id = $1`, [dupA])).rows[0].merged_into_id).toBe(dupV);
  });
});
