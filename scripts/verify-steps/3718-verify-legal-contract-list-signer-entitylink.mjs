export default {
  name: "verify-legal-contract-list-signer-entitylink",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-legal-contract-list-signer-entitylink.mjs"]);
    await ctx.run("node", ["scripts/verify-91108-tirewear-predvir-arrivefilt-slate-leftover-chrome.mjs"]);
  },
};
