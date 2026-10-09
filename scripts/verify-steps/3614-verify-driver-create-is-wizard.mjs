// verify-steps wrapper — LV-DRIVER-CREATE-IS-NOT-A-WIZARD · claim 3614
export default {
  name: "verify-driver-create-is-wizard",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-driver-create-is-wizard.mjs"]);
    await ctx.run("node", ["scripts/verify-91111-tire-severe-drvwo-slate-leftover-chrome.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-91111-tire-severe-drvwo-slate-leftover-chrome.mjs"]);
  },
};
