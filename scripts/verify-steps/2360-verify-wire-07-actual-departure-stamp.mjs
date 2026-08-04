// CLS-DISP-WIRE-07 — office/bulk/mdata delivery must stamp actual_departure_at (step 2360).
export default {
  name: "verify:wire-07-actual-departure-stamp",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-wire-07-actual-departure-stamp.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-wire-07-actual-departure-stamp.mjs"]);
  },
};
