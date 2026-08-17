export default {
  name: "verify-payments-deposited-to-account-safe-cast",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-payments-deposited-to-account-safe-cast.mjs"]);
  },
};
