export default {
  name: "verify:maintenance-entitylink-unresolved-tombstone",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-maintenance-entitylink-unresolved-tombstone.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-maintenance-entitylink-unresolved-tombstone.mjs"]);
    // BANK-F91479 — IftaPreparerCard leftover muted + basis-selector leftover refuse (never ran leftover #334155 in CI).
    // BANK-F91528 — leftover #e2e8f0 chip/hover → house #F7F8FA / #E5E7EB.
    await ctx.run("node", ["scripts/verify-basis-selector-allowed-pages.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-basis-selector-allowed-pages.mjs"]);
  },
};
