// Step 1759 — a catalog in the inventory must be openable from SOME surface. "Is this catalog
// reachable" was answered wrong twice in one session by grepping one or two of the three surfaces;
// DOMAIN_CONFIG is keyed kebab-case, so a snake_case grep reads as proof of absence and is not.
export default {
  name: "verify:catalog-reachability",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-catalog-reachability.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-catalog-reachability.mjs"]);
  },
};
