/** @type {import("./_context.mjs").VerifyStep} */
export default {
  name: "verify-fleettable-unit-cell-maintenance-mode",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fleettable-unit-cell-maintenance-mode.mjs"]);
  },
};
