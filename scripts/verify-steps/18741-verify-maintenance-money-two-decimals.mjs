// Register row 152 / D033 (Lead 443.301): Maintenance money always two decimals. Claimed number 18741 (LEAD).
export default {
  name: "verify-maintenance-money-two-decimals",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-maintenance-money-two-decimals.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-maintenance-money-two-decimals.mjs"]);
  },
};
