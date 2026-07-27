export default {
  name: "verify-netpay-floor-at-close",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-netpay-floor-at-close.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-netpay-floor-at-close.mjs"]);
  },
};
