export default {
  name: "verify-bank-f10-overage-queue-ui",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bank-f10-overage-queue-ui.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-bank-f10-overage-queue-ui.mjs"]);
  },
};
