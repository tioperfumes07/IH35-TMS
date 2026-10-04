export default {
  name: "verify-saf-eld-audit-trail-query-error-surface",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-saf-eld-audit-trail-query-error-surface.mjs"]);
    // BANK-F91499 — CargoSensor leftover fontSize: 10 refuse (go20-cargo-incidents is not a verify-step; leftover now on this EVEN host).
    await ctx.run("node", ["scripts/verify-go20-cargo-incidents.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-go20-cargo-incidents.mjs"]);
  },
};
