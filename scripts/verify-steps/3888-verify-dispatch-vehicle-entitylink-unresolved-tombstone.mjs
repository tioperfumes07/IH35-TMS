export default {
  name: "verify:dispatch-vehicle-entitylink-unresolved-tombstone",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-vehicle-entitylink-unresolved-tombstone.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-dispatch-vehicle-entitylink-unresolved-tombstone.mjs"]);
    // BANK-F91477 + BANK-F91508 — OwnerHome leftover muted + Factoring KPI #475569 refuse.
    await ctx.run("node", ["scripts/verify-home-quickjump-counts.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-home-quickjump-counts.mjs"]);
  },
};
