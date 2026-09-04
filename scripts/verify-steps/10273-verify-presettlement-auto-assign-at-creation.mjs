/** SET-01 — every load with driver + trip_type links to a pre-settlement inside the booking
 * transaction. Run both the planted-regression proof and the live source contract. */
export default {
  name: "verify-presettlement-auto-assign-at-creation",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-presettlement-auto-assign-at-creation.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-presettlement-auto-assign-at-creation.mjs"]);
  },
};
