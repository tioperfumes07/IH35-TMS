/**
 * ROUND E23 — wires scripts/verify-no-capability-regression.mjs (the capability registry
 * backstop) into CI. Static, no DATABASE_URL needed.
 */
export default {
  name: "verify-no-capability-regression",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-capability-regression.mjs"]);
  },
};
