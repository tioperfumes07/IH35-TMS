export default {
  name: "verify:inventory-entitylink-unresolved-tombstone",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-inventory-entitylink-unresolved-tombstone.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-inventory-entitylink-unresolved-tombstone.mjs"]);
    // BANK-F91482 — LoadBolPanel leftover muted + orphan API-origin leftover refuse (never ran leftover in CI).
    await ctx.run("node", ["scripts/verify-load-bol-download-api-origin.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-load-bol-download-api-origin.mjs"]);
  },
};
