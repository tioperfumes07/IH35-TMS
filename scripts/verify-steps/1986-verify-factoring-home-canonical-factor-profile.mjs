export default {
  name: "verify:factoring-home-canonical-factor-profile",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-factoring-home-canonical-factor-profile.mjs"]);
    // BANK-F91454 — R315 Payments to You / Escrow Account tabs (never ran in CI).
    await ctx.run("node", ["scripts/ops/verify-factoring-r315-payments-tabs.mjs", "--selftest"]);
  },
};
