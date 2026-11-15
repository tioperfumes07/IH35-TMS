import { describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { rekeyItems } from "./desk.service.js";

function fake(items: Array<{ id: string; brand: string; name: string; identity_key: string; display_name: string }>) {
  const writes: string[] = [];
  const c = {
    query: async (sql: string) => {
      if (/^UPDATE/.test(sql.trim())) { writes.push(sql); return { rows: [], rowCount: 1 }; }
      // Brand-index write counters (loadNameBrands fingerprint): no stats row → the index is rebuilt every call.
      if (/FROM pg_stat_user_tables/.test(sql)) return { rows: [] };
      if (/FROM perfume\.brand_aliases/.test(sql)) return { rows: [] };
      if (/SELECT brand, name FROM perfume\.items/.test(sql)) return { rows: items.map(({ brand, name }) => ({ brand, name })) };
      if (/FROM perfume\.items WHERE merged_into_id IS NULL ORDER BY/.test(sql)) return { rows: items };
      throw new Error(`unexpected ${sql}`);
    },
  } as unknown as PoolClient;
  return { c, writes };
}
const items = [
  { id: "a", brand: "LANCOME", name: "IDOLE LANCOME", identity_key: "LANCOME|IDOLE LANCOME|100|EDP|W|", display_name: "LANCOME · IDOLE LANCOME · 100 ml" },
  { id: "b", brand: "LANCOME", name: "IDOLE", identity_key: "LANCOME|IDOLE|100|EDP|W|", display_name: "LANCOME · IDOLE · 100 ml" },
  { id: "c", brand: "HALLOWEEN", name: "BLOSSOM", identity_key: "HALLOWEEN|BLOSSOM|100|EDT|W|", display_name: "HALLOWEEN · BLOSSOM · 100 ml · EDT" },
  { id: "d", brand: "DIOR", name: "SAUVAGE", identity_key: "DIOR|SAUVAGE|100|EDT|M|", display_name: "DIOR · SAUVAGE · 100 ml" },
];
describe("rekeyItems (measured live 11-15: stored keys kept the old reading)", () => {
  it("dry run reports the re-key and the merge, writes nothing", async () => {
    const { c, writes } = fake(items);
    const r = await rekeyItems(c, { dryRun: true });
    expect(writes).toHaveLength(0);
    expect(r.changed).toBe(2);
    expect(r.samples).toContainEqual({ id: "a", from: "LANCOME|IDOLE LANCOME|100|EDP|W|", to: "LANCOME|IDOLE|100|EDP|W|", merge_into: "b" });
    expect(r.samples).toContainEqual({ id: "c", from: "HALLOWEEN|BLOSSOM|100|EDT|W|", to: "JESUS DEL POZO|HALLOWEEN BLOSSOM|100|EDT|W|", merge_into: null });
  });
  it("real run merges into the twin and renames the line-house item", async () => {
    const { c, writes } = fake(items);
    const r = await rekeyItems(c, { dryRun: false });
    expect(r).toMatchObject({ merged: 1, renamed: 1 });
    expect(writes.some((w) => /merged_into_id/.test(w))).toBe(true);
  });
});
