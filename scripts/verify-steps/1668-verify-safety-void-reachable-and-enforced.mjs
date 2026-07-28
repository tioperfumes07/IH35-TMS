/** SAF-B19 — a registered void route an operator cannot reach, and a void contract nothing enforces, are both defects. */
export default {
  name: "verify-safety-void-reachable-and-enforced",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-void-reachable-and-enforced.mjs"]);
    await ctx.run("node", ["scripts/verify-safety-void-reachable-and-enforced.mjs", "--selftest"]);
  },
};
