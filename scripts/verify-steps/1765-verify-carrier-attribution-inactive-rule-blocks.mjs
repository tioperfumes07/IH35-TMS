// Step 1765 — an "active": false lease-assignment rule must actually block. A stale past
// `active_from` silently re-enables it, which would lease units to a non-operating entity.
export default {
  name: "verify:carrier-attribution-inactive-rule-blocks",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-carrier-attribution-inactive-rule-blocks.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-carrier-attribution-inactive-rule-blocks.mjs"]);
  },
};
