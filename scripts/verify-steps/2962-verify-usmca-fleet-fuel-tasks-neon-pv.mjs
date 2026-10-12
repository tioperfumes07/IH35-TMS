export default {
  name: "verify:usmca-fleet-fuel-tasks-neon-pv",
  async run(ctx) {
    // 443.101: the guard reads live USMCA fleet/fuel/task counts, so it runs in the live-DB job (ci.yml
    // required-live-load-guard, prod read-only); its offline --selftest stays here.
    await ctx.run("node", ["scripts/verify-usmca-fleet-fuel-tasks-neon-pv.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-91179-acct-faro-factor-loans-slate-leftover-chrome.mjs"]);
  },
};
