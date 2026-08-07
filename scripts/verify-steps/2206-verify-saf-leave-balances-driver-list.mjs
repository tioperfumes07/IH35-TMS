export default {
  name: "verify-saf-leave-balances-driver-list",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-saf-leave-balances-driver-list.mjs"]);
  },
};
