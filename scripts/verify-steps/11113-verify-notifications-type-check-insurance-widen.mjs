export default {
  name: "verify-notifications-type-check-insurance-widen",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-notifications-type-check-insurance-widen.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-notifications-type-check-insurance-widen.mjs"]);
  },
};
