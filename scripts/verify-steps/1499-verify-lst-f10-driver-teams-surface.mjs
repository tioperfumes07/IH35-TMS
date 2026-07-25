export default {
  name: "verify-lst-f10-driver-teams-surface",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lst-f10-driver-teams-surface.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-lst-f10-driver-teams-surface.mjs"]);
  },
};
