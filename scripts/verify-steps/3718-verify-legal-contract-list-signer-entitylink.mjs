export default {
  name: "verify-legal-contract-list-signer-entitylink",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-legal-contract-list-signer-entitylink.mjs"]);
  },
};
