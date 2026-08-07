// INV-CAT-01 — category column N/A honesty + required create path (step 2260).
export default {
  name: "verify:inv-cat-01-category-honesty",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-inv-cat-01-category-honesty.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-inv-cat-01-category-honesty.mjs"]);
  },
};
