export default {
  name: "verify:fuel-customers-entitylink-unresolved-tombstone",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-fuel-customers-entitylink-unresolved-tombstone.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-fuel-customers-entitylink-unresolved-tombstone.mjs"]);
    // BANK-F91478 + BANK-F91508 leftover muted + BANK-F91547 leftover slate class refuse.
    await ctx.run("node", ["scripts/verify-home-quickjump-counts.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-home-quickjump-counts.mjs"]);
  },
};
