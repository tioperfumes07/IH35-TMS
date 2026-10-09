export default {
  name: "2970-verify-systemic-42p18-set-config-text",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-systemic-42p18-set-config-text.mjs"]);
    await ctx.run("node", ["scripts/verify-91175-layout-home-slate-leftover-chrome.mjs"]);
  },
};
