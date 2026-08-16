/** @type {import("./_context.mjs").VerifyStep} */
export default {
  name: "verify-topbar-responsive-no-horizontal-clip",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-topbar-responsive-no-horizontal-clip.mjs"]);
  },
};
