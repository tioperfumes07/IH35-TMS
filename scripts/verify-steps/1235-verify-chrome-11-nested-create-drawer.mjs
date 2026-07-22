/** @type {import("./_context.mjs").VerifyStep} */
export default {
  name: "verify-chrome-11-nested-create-drawer",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-chrome-11-nested-create-drawer.mjs"]);
  },
};
