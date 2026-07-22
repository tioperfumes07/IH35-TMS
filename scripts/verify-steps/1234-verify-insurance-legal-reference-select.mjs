/** @type {import("./_context.mjs").VerifyStep} */
export default {
  name: "verify-insurance-legal-reference-select",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-insurance-legal-reference-select.mjs"]);
  },
};
