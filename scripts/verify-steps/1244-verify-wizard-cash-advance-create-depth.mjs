export default {
  name: "verify-wizard-cash-advance-create-depth",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-wizard-cash-advance-create-depth.mjs"]);
  },
};
