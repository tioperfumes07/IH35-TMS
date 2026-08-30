/** WONUM D1 -- next_wo_display_id() refuses creation instead of baking in a raw unit UUID. */
export default {
  name: "verify-wonum-d1-refuse-missing-unit-number",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-wonum-d1-refuse-missing-unit-number.mjs"]);
    await ctx.run("node", ["scripts/verify-wonum-d1-refuse-missing-unit-number.mjs", "--selftest"]);
  },
};
