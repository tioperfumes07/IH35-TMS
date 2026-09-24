/**
 * ROUND 145.3 — wires scripts/verify-fuel-cost-posts-exactly-once.mjs into CI.
 * Live guard — requires DATABASE_URL for fuel + expenses + postings live check.
 */
export default {
  name: "verify-fuel-cost-posts-exactly-once",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fuel-cost-posts-exactly-once.mjs"]);
  },
};
