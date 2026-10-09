export default {
  name: "verify-accounting-register-lists-suppress-toolbar-search",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-accounting-register-lists-suppress-toolbar-search.mjs"]);
    await ctx.run("node", ["scripts/verify-91132-tb-hist-factor-slate-leftover-chrome.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-91132-tb-hist-factor-slate-leftover-chrome.mjs"]);
  },
};
