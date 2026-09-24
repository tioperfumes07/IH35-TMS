/**
 * ROUND E23 — wires scripts/verify-no-stale-literals-in-guards.mjs (the §9.0.17 sweep that
 * catches hardcoded counts in guards and baselines) into CI. Static, no DATABASE_URL needed.
 */
export default {
  name: "verify-no-stale-literals-in-guards",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-stale-literals-in-guards.mjs"]);
  },
};
