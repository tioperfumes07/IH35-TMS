/**
 * DEVIN-B ROUND 181 — wires scripts/verify-no-auto-generated-account-numbers.mjs into CI.
 * Static + live guard — no auto-generated account numbers without owner approval.
 */
export default {
  name: "verify-no-auto-generated-account-numbers",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-auto-generated-account-numbers.mjs"]);
  },
};
