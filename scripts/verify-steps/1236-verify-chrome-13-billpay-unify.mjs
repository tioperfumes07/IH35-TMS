/** @type {import("./_context.mjs").VerifyStep} */
export default {
  name: "verify-chrome-13-billpay-unify",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-chrome-13-billpay-unify.mjs"]);
  },
};
