export default {
  name: "verify:safety-entitylink-unresolved-tombstone",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-safety-entitylink-unresolved-tombstone.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-safety-entitylink-unresolved-tombstone.mjs"]);
    // BANK-F91481 — SafetyGroupNav leftover muted + leftover refuse (never ran leftover #334155 in CI).
    await ctx.run("node", ["scripts/verify-safety-nav-no-dual-navigate.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-safety-nav-no-dual-navigate.mjs"]);
  },
};
