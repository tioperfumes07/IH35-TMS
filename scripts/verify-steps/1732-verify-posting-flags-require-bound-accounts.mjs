/** MONEY GATE — a migration may not arm a posting flag without naming its required CoA roles. */
export default {
  name: "verify-posting-flags-require-bound-accounts",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-posting-flags-require-bound-accounts.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-posting-flags-require-bound-accounts.mjs"]);
  },
};
