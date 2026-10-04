export default {
  name: "verify:system-tabs-url-sync",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-system-tabs-url-sync.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-system-tabs-url-sync.mjs"]);
    // BANK-F91462 — E-41 Engine-status SAVEPOINT isolation (never ran in CI).
    await ctx.run("node", ["scripts/ops/verify-e41-engine-status-savepoint.mjs", "--selftest"]);
  },
};
