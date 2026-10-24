// Register row 125 / D006 (Lead 443.301): Settlements tabs never leave the module. Claimed number 18745 (LEAD).
export default {
  name: "verify-settlements-subnav-stays-in-module",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-settlements-subnav-stays-in-module.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-settlements-subnav-stays-in-module.mjs"]);
  },
};
