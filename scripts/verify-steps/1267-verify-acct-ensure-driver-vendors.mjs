export default {
  name: "verify-acct-ensure-driver-vendors",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-ensure-driver-vendors.mjs"]);
  },
};
