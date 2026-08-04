// VEND-LINK-01 — bill/allocation vendor EntityLink canonical uuid (step 2356).
export default {
  name: "verify:vend-link-01-vendor-uuid-entitylink",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-vend-link-01-vendor-uuid-entitylink.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-vend-link-01-vendor-uuid-entitylink.mjs"]);
  },
};
