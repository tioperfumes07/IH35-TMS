export default {
  name: "verify-cash-flow-adjustment-honesty",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-cash-flow-adjustment-honesty.mjs"]);
  },
};
