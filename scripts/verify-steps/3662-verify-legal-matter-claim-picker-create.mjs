export default {
  name: "verify-legal-matter-claim-picker-create",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-legal-matter-claim-picker-create.mjs"]);
    await ctx.run("node", ["scripts/verify-91064-rev-expenses-counter-slate-leftover-chrome.mjs"]);
  },
};
