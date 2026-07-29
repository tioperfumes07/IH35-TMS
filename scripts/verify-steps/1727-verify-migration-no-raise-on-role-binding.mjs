// Step 1727 — a migration must never RAISE on an absent chart-of-accounts role binding.
// Role bindings are operational data, absent on the fresh database CI migrates; raising there breaks
// every fresh-DB run. 202610110000 shipped this bug and CI caught it twice.
export default {
  name: "verify:migration-no-raise-on-role-binding",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-migration-no-raise-on-role-binding.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-migration-no-raise-on-role-binding.mjs"]);
  },
};
