export default {
  name: "verify-pm-auto-engine-run-honesty",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-pm-auto-engine-run-honesty.mjs"]);
  },
};
