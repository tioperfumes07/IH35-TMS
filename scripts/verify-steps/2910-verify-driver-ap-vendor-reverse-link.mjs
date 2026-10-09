export default {
  name: "verify-driver-ap-vendor-reverse-link",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-driver-ap-vendor-reverse-link.mjs"]);
    await ctx.run("node", ["scripts/verify-91185-safety-reverse-pager-slate-leftover-chrome.mjs"]);
  },
};
