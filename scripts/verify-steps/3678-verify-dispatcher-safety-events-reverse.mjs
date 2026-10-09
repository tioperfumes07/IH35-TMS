export default {
  name: "verify-dispatcher-safety-events-reverse",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dispatcher-safety-events-reverse.mjs"]);
    await ctx.run("node", ["scripts/verify-91067-accttile-scenario-banktx-slate-leftover-chrome.mjs"]);
  },
};
