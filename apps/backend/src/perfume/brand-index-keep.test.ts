/** Owner 2026-11-16 14:01 CT ("it is taking very long for the confirmations"): a confirm that links a line to an existing
 *  item writes no item, so the brand index is not rebuilt (measured live: 2.2–7.1 s per Review read after a confirm). */
import { describe, expect, it } from "vitest";
import { invalidateGridCache, loadNameBrands } from "./desk.service.js";

function client() {
  const sqls: string[] = [];
  const c = { query: async (sql: string) => {
    sqls.push(sql);
    if (sql.includes("pg_stat_user_tables")) return { rows: [{ s: "items:1:0:0|brand_aliases:0:0:0" }] };
    if (sql.includes("brand_aliases")) return { rows: [] };
    return { rows: [{ brand: "LATTAFA", name: "RAMZ GOLD" }] };
  } };
  return { c: c as never, rebuilds: () => sqls.filter((s) => s.includes("FROM perfume.items")).length };
}

describe("brand index after a desk write", () => {
  it("stays when the write linked lines to existing items", async () => {
    const k = client();
    invalidateGridCache();
    await loadNameBrands(k.c);
    invalidateGridCache({ itemsUnchanged: true });
    await loadNameBrands(k.c);
    expect(k.rebuilds()).toBe(1);
  });
  it("is rebuilt when the write may have added or changed items", async () => {
    const k = client();
    invalidateGridCache();
    await loadNameBrands(k.c);
    invalidateGridCache();
    await loadNameBrands(k.c);
    expect(k.rebuilds()).toBe(2);
  });
});
