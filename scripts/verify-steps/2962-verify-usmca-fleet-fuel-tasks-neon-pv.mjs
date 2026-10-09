export default {
  name: "verify:usmca-fleet-fuel-tasks-neon-pv",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-usmca-fleet-fuel-tasks-neon-pv.mjs"]);
    await ctx.run("node", ["scripts/verify-91179-acct-faro-factor-loans-slate-leftover-chrome.mjs"]);
  },
};
