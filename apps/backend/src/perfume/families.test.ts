/**
 * PERFUME item families (owner 2026-11-27 08:10 CT): a family groups its items, rolls up their stock, both histories record every
 * join / leave, a duplicate family is refused, archiving is refused while items belong to it, and the scent-family list counts and
 * renames on families. Real Postgres, one transaction rolled back.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../lib/pg-connection-options.js";
import { TEST_OWNER_USER_ID } from "../../test-helpers/constants.js";
import { ensureIntegrationPrerequisites } from "../../test-helpers/db-fixture.js";
import { archiveFamily, createFamily, familyProfile, listFamilies, updateFamily } from "./families.service.js";
import { bulkEditItems, createItem, getItemFile, listItemFile, updateItemFile } from "./items.service.js";
import { addCatalogValue, listCatalogs, renameCatalogValue } from "./leads.service.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");
describeIntegration("item families (real Postgres, rolled back)", () => {
  let db: pg.Client;
  const u = TEST_OWNER_USER_ID;
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

  it("groups items, rolls up stock, records both histories, refuses duplicates and early archive", async () => {
    const fam = await createFamily(db as never, u, { name: "ZZF Queen", brand: "ZZF", olfactory_family: "Floral", gender: "W", launch_year: 2019 });
    await expect(createFamily(db as never, u, { name: "zzf queen", brand: "zzf" })).rejects.toThrow(/already exists/);

    const a = await createItem(db as never, u, { brand: "ZZF", name: "QUEEN", size_ml: 100, conc: "EDP", gender: "W", family_id: fam.id });
    const b = await createItem(db as never, u, { brand: "ZZF", name: "QUEEN", size_ml: 50, conc: "EDP", gender: "W" });
    const t = await createItem(db as never, u, { brand: "ZZF", name: "QUEEN", size_ml: 100, conc: "EDP", gender: "W", flags: ["TESTER"] });
    await updateItemFile(db as never, u, b.id, { family_id: fam.id });
    expect(await bulkEditItems(db as never, u, { ids: [t.id], set: { family_id: fam.id } })).toEqual({ updated: 1 });

    await db.query(`INSERT INTO perfume.item_stock (item_id, location_code, qty, avg_cost_cents) VALUES ($1, (SELECT code FROM perfume.locations ORDER BY sort_order LIMIT 1), 10, 2500)`, [a.id]);
    const list = (await listFamilies(db as never, { q: "ZZF", limit: 50 })).rows;
    expect(list).toEqual([expect.objectContaining({ id: fam.id, items: 3, on_hand: 10, stock_value_cents: 25000, olfactory_family: "Floral" })]);

    const prof = await familyProfile(db as never, fam.id) as { items: Array<{ id: string }>; events: Array<{ kind: string }> };
    expect(prof.items.map((i) => i.id).sort()).toEqual([a.id, b.id, t.id].sort());
    expect(prof.events.map((e) => e.kind)).toEqual(["created", "item_added", "item_added", "item_added"]);
    const ia = await getItemFile(db as never, a.id) as { item: { family: string }; events: Array<{ kind: string }> };
    expect(ia.item.family).toBe("ZZF Queen");
    expect(ia.events.map((e) => e.kind)).toEqual(["created", "family"]);
    expect((await listItemFile(db as never, { q: "ZZF", limit: 10, offset: 0, scope: "all" })).rows.every((r) => r.family === "ZZF Queen")).toBe(true);

    await db.query("SAVEPOINT a1");
    await expect(archiveFamily(db as never, u, fam.id)).rejects.toThrow(/still belong/);
    await db.query("ROLLBACK TO SAVEPOINT a1");

    // Leaving a family is written on both sides.
    await updateItemFile(db as never, u, t.id, { family_id: null });
    expect(((await familyProfile(db as never, fam.id)) as { events: Array<{ kind: string }> }).events.at(-1)!.kind).toBe("item_removed");

    expect(await updateFamily(db as never, u, fam.id, { launch_year: 2020 })).toMatchObject({ changed: 1 });
  });

  it("scent families are their own list, counted and renamed on families", async () => {
    const v = await addCatalogValue(db as never, u, { kind: "olfactory_family", value: "ZZ Musky" });
    const f = await createFamily(db as never, u, { name: "ZZG Musk", olfactory_family: "ZZ Musky" });
    const k = (await listCatalogs(db as never)).kinds.find((x) => x.kind === "olfactory_family")!;
    expect(k.used_by).toBe("families");
    expect(k.values.find((x) => x.value === "ZZ Musky")!.contacts).toBe(1);
    expect(k.values.map((x) => x.value)).toEqual(expect.arrayContaining(["Floral", "Woody", "Gourmand"]));
    expect(await renameCatalogValue(db as never, v.id, "ZZ Musk", u)).toMatchObject({ items_moved: 1 });
    expect(((await familyProfile(db as never, f.id)) as { family: { olfactory_family: string } }).family.olfactory_family).toBe("ZZ Musk");
  });
});
