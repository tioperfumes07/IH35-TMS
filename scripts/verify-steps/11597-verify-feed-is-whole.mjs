/**
 * ROUND 142.1 — wires scripts/verify-feed-is-whole.mjs into CI.
 * Live guard — requires DATABASE_URL for factoring_advances live check.
 */
export default {
  name: "verify-feed-is-whole",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-feed-is-whole.mjs"]);
  },
};
