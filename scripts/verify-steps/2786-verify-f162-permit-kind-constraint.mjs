export default {
  name: "f162-permit-kind-constraint",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-f162-permit-kind-constraint.mjs"]);
    await ctx.run("node", ["scripts/verify-91193-identity-sidebar-liststate-slate-leftover-chrome.mjs"]);
  },
};
