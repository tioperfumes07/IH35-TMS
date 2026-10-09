export default {
  name: "verify-no-patch-or-defer-language",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-patch-or-defer-language.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-no-patch-or-defer-language.mjs"]);
    await ctx.run("node", ["scripts/verify-91168-dup-legal-425c-slate-leftover-chrome.mjs"]);
  },
};
