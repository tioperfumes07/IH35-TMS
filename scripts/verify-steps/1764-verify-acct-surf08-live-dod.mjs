export default {
  name: "verify-acct-surf08-live-dod",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-surf08-live-dod.mjs"]);
  },
};
