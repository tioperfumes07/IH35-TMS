/** @type {import("./_context.mjs").VerifyStep} */
export default {
  name: "verify-fa-archive-canonical",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fa-archive-canonical.mjs"]);
  },
};
