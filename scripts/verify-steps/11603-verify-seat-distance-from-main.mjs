/**
 * DEVIN-B — wires scripts/verify-seat-distance-from-main.mjs into CI.
 * Static git guard — no DATABASE_URL required. Measures branch distance
 * from origin/main to prevent stale-base CI failures and silent merge drops.
 */
export default {
  name: "verify-seat-distance-from-main",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-seat-distance-from-main.mjs"]);
  },
};
