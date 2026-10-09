export default {
  name: "verify-reports-ifta-runner-canonical-alias",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reports-ifta-runner-canonical-alias.mjs"]);
    await ctx.run("node", ["scripts/verify-91085-drv-cashadv-escrow-settlefin-slate-leftover-chrome.mjs"]);
  },
};
