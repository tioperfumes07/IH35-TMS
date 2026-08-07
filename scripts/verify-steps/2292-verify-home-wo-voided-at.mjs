// Step 2292 — Home WO count surfaces must exclude voided rows (HOME-attention-maintenance).
// Prod: Home "WOS OPEN: 2" while Maintenance showed 0 — both rows were voided demo records.
export default {
  name: "verify-home-wo-voided-at",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-home-wo-voided-at.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-home-wo-voided-at.mjs"]);
  },
};
