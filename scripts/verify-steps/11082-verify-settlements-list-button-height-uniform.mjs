export default {
  name: "verify-settlements-list-button-height-uniform",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-settlements-list-button-height-uniform.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-settlements-list-button-height-uniform.mjs"]);
    // BANK-F91492 — SettlementsToursRegister leftover fontSize: 10 refuse (this EVEN host already owns the live guard).
    // BANK-F91501 — leftover fontSize: 11 totals refuse now included on the same host.
  },
};
