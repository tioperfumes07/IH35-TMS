// INV-CAT-01 — Inventory PartCreateDrawer Category SelectCombobox + category backfill (step 2006).
export default {
  name: "verify:inv-cat01-category-picker-wired",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-inv-cat01-category-picker-wired.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-inv-cat01-category-picker-wired.mjs"]);
  },
};
