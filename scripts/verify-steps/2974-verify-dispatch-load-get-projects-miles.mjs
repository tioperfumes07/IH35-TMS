export default {
  name: "2974-verify-dispatch-load-get-projects-miles",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dispatch-load-get-projects-miles.mjs"]);
    await ctx.run("node", ["scripts/verify-91173-vendor-dvir-catalog-slate-leftover-chrome.mjs"]);
  },
};
