/** @type {import("./_context.mjs").VerifyStep} */
export default {
  name: "verify-chrome-14-remaining-modal-shells",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-chrome-14-remaining-modal-shells.mjs"]);
  },
};
