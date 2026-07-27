/** INS-01 — fleet premium JE accounts resolve by CoA role, never ORDER BY created_at LIMIT 2. */
export default {
  name: "verify-fleet-premium-role-resolved",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fleet-premium-role-resolved.mjs"]);
    await ctx.run("node", ["scripts/verify-fleet-premium-role-resolved.mjs", "--selftest"]);
  },
};
