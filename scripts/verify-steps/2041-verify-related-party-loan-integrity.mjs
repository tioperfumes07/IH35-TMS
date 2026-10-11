export default {
  name: "verify-related-party-loan-integrity",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-related-party-loan-integrity.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-related-party-loan-integrity.mjs"]);
    // RULING 443.65 #2d — the party ledger = its GL account, per party; no party posting without its party entity.
    await ctx.run("node", ["scripts/verify-party-ledger-sums-to-gl-account.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-party-ledger-sums-to-gl-account.mjs"]);
  },
};
