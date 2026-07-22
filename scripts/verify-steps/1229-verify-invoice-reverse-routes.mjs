/** @type {import("./_context.mjs").VerifyStep} */
export default {
  name: "verify-invoice-reverse-routes",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-invoice-reverse-routes.mjs"]);
  },
};
