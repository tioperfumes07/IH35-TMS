/** @type {import("./_context.mjs").VerifyStep} */
export default {
  name: "verify-claim-load-reverse-and-driver-create",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-claim-load-reverse-and-driver-create.mjs"]);
  },
};
