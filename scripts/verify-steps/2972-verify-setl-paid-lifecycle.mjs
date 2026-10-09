export default {
  name: "2972-verify-setl-paid-lifecycle",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-setl-paid-lifecycle.mjs"]);
    await ctx.run("node", ["scripts/verify-91174-bookload-border-slate-leftover-chrome.mjs"]);
  },
};
