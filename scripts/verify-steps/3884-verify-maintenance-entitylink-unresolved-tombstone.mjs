export default {
  name: "verify:maintenance-entitylink-unresolved-tombstone",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-maintenance-entitylink-unresolved-tombstone.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-maintenance-entitylink-unresolved-tombstone.mjs"]);
    // BANK-F91479 — IftaPreparerCard leftover muted + basis-selector leftover refuse (never ran leftover #334155 in CI).
    await ctx.run("node", ["scripts/verify-basis-selector-allowed-pages.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-basis-selector-allowed-pages.mjs"]);
  },
};
