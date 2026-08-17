export default {
  name: "verify-reports-cash-flow-compound-label-human",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reports-cash-flow-compound-label-human.mjs"]);
  },
};
