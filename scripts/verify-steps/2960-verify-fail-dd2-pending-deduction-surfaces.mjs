export default {
  name: "verify:fail-dd2-pending-deduction-surfaces",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fail-dd2-pending-deduction-surfaces.mjs"]);
    await ctx.run("node", ["scripts/verify-91180-dqf-carrier-drvassign-slate-leftover-chrome.mjs"]);
  },
};
