export default {
  name: "verify:fuel-gl-map-codes-no-silent-alias",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fuel-gl-map-codes-no-silent-alias.mjs"]);
    // BANK leftover slate refuse piggyback (F91193)
    await ctx.run("node", ["scripts/verify-ifta-fraud-fuelgl-slate-leftover-chrome.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-ifta-fraud-fuelgl-slate-leftover-chrome.mjs"]);
  },
};
