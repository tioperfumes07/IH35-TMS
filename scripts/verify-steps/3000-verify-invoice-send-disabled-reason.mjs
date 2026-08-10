export default {
  name: "verify-invoice-send-disabled-reason",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-invoice-send-disabled-reason.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-invoice-send-disabled-reason.mjs"]);
  },
};
