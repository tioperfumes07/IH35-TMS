/** @type {import("./_context.mjs").VerifyStep} */
export default {
  name: "verify-home-driver-day-summary-toolbar-always",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-home-driver-day-summary-toolbar-always.mjs"]);
  },
};
